/**
 * Ollama vision provider — `POST /api/chat` with base64 images and JSON
 * mode. Works with any vision-capable model (llava, moondream, qwen-vl…).
 * @module api/intelligence/vision/ollama
 */

import { ensureOk, hostOf, ping } from '../http.js';
import { TAG_PROMPT } from './reply.js';

/**
 * True when `wanted` is among the models an Ollama server lists ("llava"
 * matches "llava:latest").
 * @param {any} tagsBody - Response of GET /api/tags
 * @param {string} wanted
 * @returns {boolean}
 */
export function hasOllamaModel(tagsBody, wanted) {
  const names = (tagsBody?.models || []).flatMap((m) => [m?.name, m?.model]).filter(Boolean);
  const full = wanted.includes(':') ? wanted : `${wanted}:latest`;
  return names.some((name) => name === wanted || name === full);
}

/**
 * Check that an Ollama server is up and has a model pulled.
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @param {string} model
 * @returns {Promise<import('../steps/types.js').Availability>}
 */
export async function checkOllama(fetchFn, url, model) {
  const result = await ping(fetchFn, `${url.replace(/\/+$/, '')}/api/tags`);
  if (!result.ok) return { available: false, detail: result.detail };
  if (!hasOllamaModel(result.body, model)) {
    return { available: false, detail: `model "${model}" is not pulled (ollama pull ${model})` };
  }
  return { available: true, detail: `${model} at ${hostOf(url)}` };
}

/**
 * @param {import('../settings.js').Settings['vision']} cfg
 * @param {import('../steps/types.js').Deps} deps
 * @returns {import('./index.js').VisionProvider}
 */
export function createOllamaVision(cfg, deps) {
  const base = cfg.url.replace(/\/+$/, '');
  return {
    name: 'ollama',
    available: () => checkOllama(deps.fetch, base, cfg.model),

    async describe(jpeg, options = {}) {
      const res = await deps.fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          format: 'json',
          options: { temperature: 0.2 },
          messages: [{ role: 'user', content: TAG_PROMPT, images: [jpeg.toString('base64')] }],
        }),
      });
      const data = await (await ensureOk(res, 'Ollama vision request')).json();
      return String(data?.message?.content ?? '');
    },
  };
}
