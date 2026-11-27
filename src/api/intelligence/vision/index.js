/**
 * Vision tagging providers behind one interface, selected by
 * `VISION_PROVIDER`.
 * @module api/intelligence/vision
 */

import { createOllamaVision } from './ollama.js';
import { createOpenAiVision } from './openai.js';

/**
 * @typedef {Object} VisionProvider
 * @property {string} name
 * @property {() => Promise<import('../steps/types.js').Availability>} available
 *   Cheap check with a short timeout; never throws
 * @property {(jpeg: Buffer, options?: { signal?: AbortSignal }) => Promise<string>} describe
 *   Sends one frame with the tagging prompt and resolves with the raw reply
 */

const FACTORIES = { ollama: createOllamaVision, openai: createOpenAiVision };

/**
 * Pick the vision provider for the current configuration.
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @returns {Promise<{ provider: VisionProvider|null, name: string, available: boolean, detail: string }>}
 */
export async function resolveVision(settings, deps) {
  const cfg = settings.vision;
  const unusable = (detail) => ({ provider: null, name: cfg.provider, available: false, detail });
  if (cfg.provider === 'none') return unusable('disabled (VISION_PROVIDER=none)');
  const factory = FACTORIES[cfg.provider];
  if (!factory) return unusable(`unknown VISION_PROVIDER "${cfg.provider}"`);
  const provider = factory(cfg, deps);
  const state = await provider.available();
  return { provider: state.available ? provider : null, name: cfg.provider, ...state };
}
