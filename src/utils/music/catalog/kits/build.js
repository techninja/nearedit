/**
 * Writing a kit down. Every drum is made from up to three sources — tones
 * (a sine or triangle whose pitch falls), filtered noise and a bank of
 * square waves at unrelated pitches (the "metal" of hats and cymbals) — and
 * shaped by a little drive, bit-crushing or a final low-pass. These helpers
 * only build the settings; the engine reads them (`engine/drumPatch.js`).
 * Isomorphic and pure.
 * @module utils/music/catalog/kits/build
 */

/**
 * A pitched body. All times are seconds to fall 60 dB.
 * @typedef {Object} ToneSettings
 * @property {'sine'|'triangle'} wave
 * @property {number} freq - Hz the pitch settles at
 * @property {number} sweep - It starts `freq × (1 + sweep)` high
 * @property {number} sweepTime - How long the pitch takes to settle
 * @property {number} decay
 * @property {number} level
 */

/**
 * Filtered noise. With `bursts`, it starts that many times `gap` seconds
 * apart before it rings out (a clap).
 * @typedef {Object} NoiseSettings
 * @property {'lowpass'|'bandpass'|'highpass'} type
 * @property {number} cutoff - Hz
 * @property {number} q
 * @property {number} decay
 * @property {number} level
 * @property {number} attack - Seconds to swell in (a shaker); 0 = at once
 * @property {number} bursts
 * @property {number} gap
 */

/**
 * Square waves at pitches that do not belong together, filtered.
 * @typedef {Object} MetalSettings
 * @property {number[]} freqs - Hz, at most 6
 * @property {'lowpass'|'bandpass'|'highpass'} type
 * @property {number} cutoff
 * @property {number} q
 * @property {number} decay
 * @property {number} level
 */

/**
 * One drum of a kit.
 * @typedef {Object} DrumSettings
 * @property {number} pan - Where it sits in the kit, −1 … 1
 * @property {number} level
 * @property {ToneSettings[]} tones
 * @property {NoiseSettings|null} noise
 * @property {MetalSettings|null} metal
 * @property {number} drive - 0 … 1
 * @property {number} lowpass - Hz of a final low-pass; 0 = none
 * @property {{ rate: number, bits: number }|null} crush - Sample rate and
 *   bit depth of an old sampler
 */

/**
 * @typedef {Object} Kit
 * @property {string} name
 * @property {string} label
 * @property {string} description
 * @property {Record<string, DrumSettings>} drums - By lane name (`DRUM_NAMES`)
 */

/**
 * @param {number} freq
 * @param {number} decay
 * @param {number} level
 * @param {Partial<ToneSettings>} [more]
 * @returns {ToneSettings}
 */
export function tone(freq, decay, level, more = {}) {
  return { wave: 'sine', freq, sweep: 0, sweepTime: 0.05, decay, level, ...more };
}

/**
 * @param {NoiseSettings['type']} type
 * @param {number} cutoff
 * @param {number} decay
 * @param {number} level
 * @param {Partial<NoiseSettings>} [more]
 * @returns {NoiseSettings}
 */
export function noise(type, cutoff, decay, level, more = {}) {
  return { type, cutoff, q: 0.7, decay, level, attack: 0, bursts: 0, gap: 0.01, ...more };
}

/**
 * @param {number[]} freqs
 * @param {MetalSettings['type']} type
 * @param {number} cutoff
 * @param {number} decay
 * @param {number} level
 * @param {number} [q]
 * @returns {MetalSettings}
 */
export function metal(freqs, type, cutoff, decay, level, q = 0.8) {
  return { freqs, type, cutoff, q, decay, level };
}

/**
 * @param {number} pan
 * @param {number} level
 * @param {Partial<DrumSettings>} sources
 * @returns {DrumSettings}
 */
export function drum(pan, level, sources) {
  const none = { tones: [], noise: null, metal: null, drive: 0, lowpass: 0, crush: null };
  return { pan, level, ...none, ...sources };
}

/**
 * @template T
 * @param {T} value
 * @returns {T} The value, frozen all the way down
 */
function frozen(value) {
  if (value && typeof value === 'object') Object.values(Object.freeze(value)).forEach(frozen);
  return value;
}

/**
 * @param {string} name
 * @param {string} label
 * @param {string} description
 * @param {Record<string, DrumSettings>} drums
 * @returns {Kit}
 */
export function kit(name, label, description, drums) {
  return frozen({ name, label, description, drums });
}
