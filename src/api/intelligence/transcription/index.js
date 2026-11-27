/**
 * Transcription providers behind one interface, selected by
 * `TRANSCRIBE_PROVIDER`. `auto` takes the first provider that is actually
 * usable on this machine, local ones first.
 * @module api/intelligence/transcription
 */

import { createWhisperCpp } from './whisperCpp.js';
import { createFasterWhisper } from './fasterWhisper.js';
import { createOpenAiTranscriber } from './openai.js';
import { createSshTranscriber } from './ssh.js';

/**
 * @typedef {Object} TranscribeOptions
 * @property {string} [language] - Whisper language code; empty = auto-detect
 * @property {AbortSignal} [signal]
 * @property {(fraction: number) => void} [onProgress]
 * @property {number|null} [duration] - Known media duration in seconds
 * @property {{ start: number, end: number }[]} [silences] - Known silences (chunk boundaries)
 */

/**
 * @typedef {Object} TranscribeProvider
 * @property {string} name
 * @property {() => Promise<import('../steps/types.js').Availability>} available
 *   Cheap check with a short timeout; never throws
 * @property {(filePath: string, options?: TranscribeOptions) =>
 *   Promise<import('./normalize.js').Transcript>} transcribe
 */

/** Order tried by `auto`. */
export const PROVIDER_ORDER = ['whisper-cpp', 'faster-whisper', 'openai', 'ssh'];

const FACTORIES = {
  'whisper-cpp': createWhisperCpp,
  'faster-whisper': createFasterWhisper,
  openai: createOpenAiTranscriber,
  ssh: createSshTranscriber,
};

/**
 * @typedef {Object} ResolvedProvider
 * @property {TranscribeProvider|null} provider - null when none is usable
 * @property {string} name - Chosen provider, or the configured value when unusable
 * @property {boolean} available
 * @property {string} detail
 */

/**
 * Pick the transcription provider for the current configuration.
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @returns {Promise<ResolvedProvider>}
 */
export async function resolveTranscriber(settings, deps) {
  const configured = settings.transcription.provider;
  const unusable = (detail) => ({ provider: null, name: configured, available: false, detail });
  if (configured === 'none') return unusable('disabled (TRANSCRIBE_PROVIDER=none)');

  if (configured !== 'auto') {
    const factory = FACTORIES[configured];
    if (!factory) return unusable(`unknown TRANSCRIBE_PROVIDER "${configured}"`);
    const provider = factory(settings, deps);
    const state = await provider.available();
    return { provider: state.available ? provider : null, name: configured, ...state };
  }

  const providers = PROVIDER_ORDER.map((name) => FACTORIES[name](settings, deps));
  const states = await Promise.all(providers.map((p) => p.available()));
  const first = states.findIndex((s) => s.available);
  if (first >= 0) {
    return { provider: providers[first], name: providers[first].name, ...states[first] };
  }
  const reasons = providers.map((p, i) => `${p.name}: ${states[i].detail}`).join('; ');
  return unusable(`no provider is usable — ${reasons}`);
}
