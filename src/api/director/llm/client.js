/**
 * LLM client — one interface over the `ollama` and `openai` providers:
 * streamed chat with a token callback, cancellation, timeouts, a JSON mode
 * and an availability check. Configured by `LLM_*` (CONFIGURATION.md).
 * @module api/director/llm/client
 */

import { getConfig } from '../../lib/config.js';
import { DirectorError, unavailable } from '../errors.js';
import { stripReasoning } from './clean.js';
import { ollamaProvider } from './ollama.js';
import { openaiProvider } from './openai.js';
import { readLines, watchdog } from './stream.js';
import { translateError, httpError } from './failures.js';

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ChatMessage
 * @typedef {Object} ChatRequest
 * @property {ChatMessage[]} messages
 * @property {boolean} [json] - Ask the provider for a JSON object
 * @property {(delta: string, info: { chars: number, thinking: boolean }) => void} [onToken]
 * @property {AbortSignal} [signal]
 * @property {number} [timeoutMs] - Whole request, default 15 minutes
 * @property {number} [idleMs] - Longest silence from the server, default 5 minutes
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @typedef {{ delta?: string, thinking?: boolean, done?: boolean, error?: string }} StreamEvent
 * @typedef {Object} Provider
 * @property {string} name
 * @property {boolean} [jsonFallback]
 * @property {(req: ChatRequest) => { url: string, init: any }} request
 * @property {(line: string) => StreamEvent|null} parseLine
 * @property {(fetchImpl: typeof fetch, signal: AbortSignal) =>
 *   Promise<{ available: boolean, detail: string }>} available
 * @typedef {Object} LlmClient
 * @property {string} provider
 * @property {string} model
 * @property {boolean} enabled - false when LLM_PROVIDER is `none` or unknown
 * @property {(timeoutMs?: number) => Promise<{ available: boolean, detail: string }>} available
 * @property {(req: ChatRequest) => Promise<{ text: string, raw: string }>} chat -
 *   `text` has reasoning blocks removed; `raw` is everything the model sent
 */

const PROVIDERS = { ollama: ollamaProvider, openai: openaiProvider };

/**
 * @param {import('../../lib/config.js').ProviderConfig} [cfg] - Defaults to the LLM_* settings
 * @param {{ fetch?: typeof fetch }} [deps] - Injectable transport for tests
 * @returns {LlmClient}
 */
export function createLlmClient(cfg = getConfig().llm, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const make = PROVIDERS[cfg.provider];
  const provider = make ? make(cfg) : null;
  const disabled =
    cfg.provider === 'none'
      ? 'No LLM provider is configured (LLM_PROVIDER=none)'
      : `Unknown LLM_PROVIDER "${cfg.provider}" (use ollama, openai or none)`;

  return {
    provider: cfg.provider,
    model: cfg.model,
    enabled: Boolean(provider),

    async available(timeoutMs = 2500) {
      if (!provider) return { available: false, detail: disabled };
      const dog = watchdog({ timeoutMs, idleMs: timeoutMs });
      try {
        return await provider.available(fetchImpl, dog.signal);
      } catch (err) {
        return { available: false, detail: translateError(err, dog.reason(), cfg).message };
      } finally {
        dog.done();
      }
    },

    async chat(req) {
      if (!provider) throw unavailable(disabled);
      const full = { temperature: 0.3, maxTokens: 4096, ...req };
      const dog = watchdog({
        signal: req.signal,
        timeoutMs: req.timeoutMs ?? 900_000,
        idleMs: req.idleMs ?? 300_000,
      });
      try {
        let { url, init } = provider.request(full);
        let res = await fetchImpl(url, { ...init, signal: dog.signal });
        if (res.status === 400 && full.json && provider.jsonFallback) {
          ({ url, init } = provider.request({ ...full, json: false }));
          res = await fetchImpl(url, { ...init, signal: dog.signal });
        }
        if (!res.ok) throw await httpError(res, cfg);
        let raw = '';
        for await (const line of readLines(res)) {
          dog.touch();
          const event = provider.parseLine(line);
          if (!event) continue;
          if (event.error) throw new DirectorError(`LLM error: ${event.error}`, { status: 502 });
          if (event.delta) raw += event.delta;
          if (event.delta || event.thinking)
            req.onToken?.(event.delta || '', { chars: raw.length, thinking: !event.delta });
          if (event.done) break;
        }
        return { raw, text: stripReasoning(raw) };
      } catch (err) {
        throw translateError(err, dog.reason(), cfg);
      } finally {
        dog.done();
      }
    },
  };
}
