/**
 * OpenAI-compatible vision provider — `POST /v1/chat/completions` with the
 * frame as an image data URL. Only the universally supported request fields
 * are sent, so it works with OpenAI, vLLM, llama.cpp, LM Studio, LocalAI…
 * @module api/intelligence/vision/openai
 */

import { bearer, ensureOk, hostOf, openAiUrl, ping } from '../http.js';
import { TAG_PROMPT } from './reply.js';

/**
 * Check that an OpenAI-compatible server answers (and accepts the key).
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<import('../steps/types.js').Availability>}
 */
export async function checkOpenAi(fetchFn, url, apiKey, model) {
  const result = await ping(fetchFn, openAiUrl(url, '/models'), { headers: bearer(apiKey) });
  // A server without a model list (404) is still a server that answered.
  if (!result.ok && result.status !== 404) return { available: false, detail: result.detail };
  return { available: true, detail: `${model} at ${hostOf(url)}` };
}

/**
 * @param {import('../settings.js').Settings['vision']} cfg
 * @param {import('../steps/types.js').Deps} deps
 * @returns {import('./index.js').VisionProvider}
 */
export function createOpenAiVision(cfg, deps) {
  return {
    name: 'openai',
    available: () => checkOpenAi(deps.fetch, cfg.url, cfg.apiKey, cfg.model),

    async describe(jpeg, options = {}) {
      const image = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      const res = await deps.fetch(openAiUrl(cfg.url, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(cfg.apiKey) },
        signal: options.signal,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: TAG_PROMPT },
                { type: 'image_url', image_url: { url: image } },
              ],
            },
          ],
        }),
      });
      const data = await (await ensureOk(res, 'Vision request')).json();
      const content = data?.choices?.[0]?.message?.content;
      // Some servers return the content as a list of typed parts.
      if (Array.isArray(content)) return content.map((part) => part?.text ?? '').join('');
      return String(content ?? '');
    },
  };
}
