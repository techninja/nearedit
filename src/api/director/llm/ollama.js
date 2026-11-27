/**
 * Ollama provider — `POST /api/chat`, streamed as newline-delimited JSON.
 * @module api/director/llm/ollama
 */

/** Context window requested from Ollama; the media digest is budgeted to fit. */
export const NUM_CTX = 16384;

/**
 * @typedef {import('./client.js').ChatRequest} ChatRequest
 * @typedef {import('./client.js').StreamEvent} StreamEvent
 * @typedef {import('./client.js').Provider} Provider
 */

/**
 * @param {import('../../lib/config.js').ProviderConfig} cfg
 * @returns {Provider}
 */
export function ollamaProvider(cfg) {
  const base = cfg.url.replace(/\/+$/, '');
  return {
    name: 'ollama',

    /** @param {ChatRequest} req */
    request(req) {
      const body = {
        model: cfg.model,
        messages: req.messages,
        stream: true,
        ...(req.json && { format: 'json' }),
        options: { temperature: req.temperature, num_predict: req.maxTokens, num_ctx: NUM_CTX },
      };
      return {
        url: `${base}/api/chat`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      };
    },

    /**
     * One NDJSON line: `{"message":{"content":"…"},"done":false}`.
     * @param {string} line
     * @returns {StreamEvent|null}
     */
    parseLine(line) {
      const trimmed = line.trim();
      if (!trimmed) return null;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        return null; // not JSON: a proxy banner or a keep-alive, never content
      }
      if (msg.error) return { error: String(msg.error) };
      return {
        delta: msg.message?.content || '',
        thinking: Boolean(msg.message?.thinking),
        done: msg.done === true,
      };
    },

    /**
     * Reachable, and is the configured model installed?
     * @param {typeof fetch} fetchImpl
     * @param {AbortSignal} signal
     * @returns {Promise<{ available: boolean, detail: string }>}
     */
    async available(fetchImpl, signal) {
      const res = await fetchImpl(`${base}/api/tags`, { signal });
      if (!res.ok) return { available: false, detail: `Ollama answered HTTP ${res.status}` };
      const data = await res.json();
      const names = (data.models || []).map((m) => String(m.name || m.model || ''));
      const wanted = cfg.model.includes(':') ? cfg.model : `${cfg.model}:latest`;
      if (names.includes(wanted) || names.includes(cfg.model))
        return { available: true, detail: '' };
      return {
        available: false,
        detail: `Model "${cfg.model}" is not installed on the Ollama server (ollama pull ${cfg.model})`,
      };
    },
  };
}
