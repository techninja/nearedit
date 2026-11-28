/**
 * A drum's settings as the numbers its voice works with: frequencies as
 * turns per sample, times as the factor a level is multiplied by every
 * sample, filters as coefficients. Made once per drum when a renderer is
 * created. Isomorphic and pure.
 * @module utils/music/engine/drumPatch
 */

import { cutoffCoefficient, filterMix } from './filter.js';
import { decayPerSample, sinTurn } from './math.js';

/** @typedef {import('#utils/music/catalog/kits/build.js').DrumSettings} DrumSettings */

/** Loudness of one drum at full velocity, before the part's volume. */
const DRUM_GAIN = 1;

/**
 * @typedef {Object} DrumPatch
 * @property {{ inc: number, sweep: number, sweepCoef: number, decayCoef: number, gain: number,
 *   triangle: boolean }[]} tones
 * @property {{ gain: number, decayCoef: number, burstCoef: number, bursts: number, gap: number,
 *   attack: number, g: number, k: number, mix: number[] }|null} noise
 * @property {{ incs: number[], gain: number, decayCoef: number, g: number, k: number,
 *   mix: number[] }|null} metal
 * @property {number} pre - Gain into the drive; 0 = no drive
 * @property {number} post - Gain out of it
 * @property {number} lowpass - Coefficient of the final low-pass; 0 = none
 * @property {number} hold - Turns per sample of the crusher's clock; 0 = none
 * @property {number} steps - Levels of the crusher on each side of zero
 * @property {number} left - Gain to the left channel
 * @property {number} right
 */

/**
 * @param {{ type: string, cutoff: number, q: number }} filter
 * @param {number} sampleRate
 * @returns {{ g: number, k: number, mix: number[] }} A band-pass keeps its
 *   peak at the level of what goes in
 */
function filterOf(filter, sampleRate) {
  const k = 1 / Math.max(0.3, filter.q);
  const [low, band, high] = filterMix(filter.type);
  return { g: cutoffCoefficient(filter.cutoff, sampleRate), k, mix: [low, band * k, high] };
}

/**
 * @param {DrumSettings} drum
 * @param {number} sampleRate
 * @returns {DrumPatch}
 */
export function compileDrum(drum, sampleRate) {
  const top = 0.45 * sampleRate;
  const tones = drum.tones.slice(0, 2).map((tone) => ({
    inc: Math.min(tone.freq, top / (1 + tone.sweep)) / sampleRate,
    sweep: tone.sweep,
    sweepCoef: decayPerSample(tone.sweepTime, sampleRate),
    decayCoef: decayPerSample(tone.decay, sampleRate),
    gain: tone.level,
    triangle: tone.wave === 'triangle',
  }));
  const noise = drum.noise && {
    gain: drum.noise.level,
    decayCoef: decayPerSample(drum.noise.decay, sampleRate),
    burstCoef: decayPerSample(drum.noise.gap * 2.5, sampleRate),
    bursts: drum.noise.bursts,
    gap: Math.max(1, Math.round(drum.noise.gap * sampleRate)),
    attack: Math.round(drum.noise.attack * sampleRate),
    ...filterOf(drum.noise, sampleRate),
  };
  const metal = drum.metal && {
    incs: drum.metal.freqs.slice(0, 6).map((freq) => Math.min(freq, top / 2) / sampleRate),
    gain: drum.metal.level / Math.sqrt(Math.max(1, Math.min(6, drum.metal.freqs.length))),
    decayCoef: decayPerSample(drum.metal.decay, sampleRate),
    ...filterOf(drum.metal, sampleRate),
  };
  const pre = drum.drive > 0 ? 1 + 5 * drum.drive : 0;
  // Equal-power place in the kit: 0 is the middle, at full level on both sides.
  const angle = (Math.max(-1, Math.min(1, drum.pan)) + 1) / 8;
  const gain = drum.level * DRUM_GAIN * Math.SQRT2;
  return {
    tones,
    noise,
    metal,
    pre,
    post: pre ? (1 + 2 * drum.drive) / pre : 1,
    lowpass: drum.lowpass > 0 ? cutoffCoefficient(drum.lowpass, sampleRate) : 0,
    hold: drum.crush ? Math.min(1, drum.crush.rate / sampleRate) : 0,
    steps: drum.crush ? 1 << (Math.max(2, Math.min(16, Math.round(drum.crush.bits))) - 1) : 0,
    left: gain * sinTurn(0.25 - angle),
    right: gain * sinTurn(angle),
  };
}
