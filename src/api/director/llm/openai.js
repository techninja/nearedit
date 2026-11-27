/**
 * OpenAI-compatible provider — `POST /v1/chat/completions`, streamed as
 * server-sent events. Works with any server speaking that API (llama.cpp,
 * vLLM, LM Studio, OpenAI…); the bearer key is optional.
 * @module api/director/llm/openai
 */

/**
 * @typedef {import('./client.js').ChatRequest} ChatRequest
 * @typedef {import('./client.js').StreamEvent} StreamEvent
 * @typedef {import('./client.js').Provider} Provider
 */

/**
 * @param {import('../../lib/config.js').ProviderConfig} cfg
 * @returns {Provider}
 */
export function openaiProvider(cfg) {
  const base = cfg.url.replace(/\/+$/, '');
  const root = base.endsWith('/v1') ? base : `${base}/v1`;
  const headers = {
    'Content-Type': 'application/json',
    ...(cfg.apiKey && { Authorization: `Bearer ${cfg.apiKey}` }),
  };
  return {
    name: 'openai',
    /** Some compatible servers reject `response_format`; retry without it. */
    jsonFallback: true,

    /** @param {ChatRequest} req */
    request(req) {
      const body = {
        model: cfg.model,
        messages: req.messages,
        stream: true,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        ...(req.json && { response_format: { type: 'json_object' } }),
      };
      return {
        url: `${root}/chat/completions`,
        init: { method: 'POST', headers, body: JSON.stringify(body) },
      };
    },

    /**
     * One SSE line: `data: {"choices":[{"delta":{"content":"…"}}]}` or
     * `data: [DONE]`. A server that ignores `stream` answers with one plain
     * JSON body, which is read as a single complete message.
     * @param {string} line
     * @returns {StreamEvent|null}
     */
    parseLine(line) {
      const trimmed = line.trim();
      const sse = trimmed.startsWith('data:');
      if (!sse && !trimmed.startsWith('{')) return null; // comment, event name, blank
      const payload = sse ? trimmed.slice(5).trim() : trimmed;
      if (payload === '[DONE]') return { delta: '', thinking: false, done: true };
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        return null; // a plain body spread over several lines: not a stream event
      }
      if (msg.error) return { error: String(msg.error.message || msg.error) };
      const choice = msg.choices?.[0] || {};
      const delta = choice.delta || {};
      return {
        delta: delta.content || choice.message?.content || '',
        thinking: Boolean(delta.reasoning_content || delta.reasoning),
        done: !sse && Boolean(choice.message),
      };
    },

    /**
     * @param {typeof fetch} fetchImpl
     * @param {AbortSignal} signal
     * @returns {Promise<{ available: boolean, detail: string }>}
     */
    async available(fetchImpl, signal) {
      const res = await fetchImpl(`${root}/models`, { headers, signal });
      if (res.ok) return { available: true, detail: '' };
      const why = res.status === 401 || res.status === 403 ? ' (check LLM_API_KEY)' : '';
      return { available: false, detail: `LLM server answered HTTP ${res.status}${why}` };
    },
  };
}
