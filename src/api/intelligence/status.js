/**
 * GET /intelligence/status — which providers are configured and reachable.
 * Every check is cheap and time-limited and they run in parallel, so the
 * route answers quickly even when nothing is installed.
 * @module api/intelligence/status
 */

import { getSettings } from './settings.js';
import { defaultDeps } from './steps/types.js';
import { resolveTranscriber } from './transcription/index.js';
import { resolveVision } from './vision/index.js';
import { checkOllama } from './vision/ollama.js';
import { checkOpenAi } from './vision/openai.js';

/**
 * @param {import('./steps/types.js').Deps} deps
 * @returns {Promise<import('./steps/types.js').Availability>}
 */
async function checkFfmpeg(deps) {
  try {
    const { stdout } = await deps.run('ffmpeg', ['-version'], { timeout: 3000 });
    return { available: true, detail: /ffmpeg version (\S+)/.exec(stdout)?.[1] || '' };
  } catch (err) {
    const missing = err.code === 'ENOENT';
    return { available: false, detail: missing ? 'ffmpeg not found on PATH' : err.message };
  }
}

/**
 * The director's LLM is checked here too so one call paints the whole
 * "what is set up" picture. Same protocols as the vision providers.
 * @param {import('./settings.js').Settings['llm']} cfg
 * @param {import('./steps/types.js').Deps} deps
 * @returns {Promise<import('./steps/types.js').Availability>}
 */
async function checkLlm(cfg, deps) {
  if (cfg.provider === 'none') return { available: false, detail: 'disabled (LLM_PROVIDER=none)' };
  if (cfg.provider === 'ollama') return checkOllama(deps.fetch, cfg.url, cfg.model);
  if (cfg.provider === 'openai') return checkOpenAi(deps.fetch, cfg.url, cfg.apiKey, cfg.model);
  return { available: false, detail: `unknown LLM_PROVIDER "${cfg.provider}"` };
}

/**
 * @param {import('./settings.js').Settings} [settings]
 * @param {import('./steps/types.js').Deps} [deps]
 * @returns {Promise<{
 *   ffmpeg: { available: boolean, detail: string },
 *   transcription: { provider: string, configured: string, model: string, available: boolean,
 *     detail: string },
 *   vision: { provider: string, model: string, available: boolean, detail: string },
 *   llm: { provider: string, model: string, available: boolean, detail: string },
 * }>}
 */
export async function getStatus(settings = getSettings(), deps = defaultDeps) {
  const [ffmpeg, transcriber, vision, llm] = await Promise.all([
    checkFfmpeg(deps),
    resolveTranscriber(settings, deps),
    resolveVision(settings, deps),
    checkLlm(settings.llm, deps),
  ]);
  return {
    ffmpeg,
    transcription: {
      provider: transcriber.name,
      configured: settings.transcription.provider,
      model: settings.transcription.model,
      available: transcriber.available,
      detail: transcriber.detail,
    },
    vision: {
      provider: vision.name,
      model: settings.vision.model,
      available: vision.available,
      detail: vision.detail,
    },
    llm: { provider: settings.llm.provider, model: settings.llm.model, ...llm },
  };
}
