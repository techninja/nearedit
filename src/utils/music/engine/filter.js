/**
 * The resonant filter: a state-variable filter integrated with the
 * trapezoidal rule (Zavalishin / Simper). Its poles stay inside the unit
 * circle for every cutoff below Nyquist and every positive damping, so it
 * cannot blow up however high the cutoff and the resonance are set, and it
 * keeps its tuning near the top of the range. Isomorphic and pure.
 * @module utils/music/engine/filter
 */

import { exp, tanHalf } from './math.js';

/** How the three outputs are mixed for each filter type: `[low, band, high]`. */
const MIX = { lowpass: [1, 0, 0], lowpass24: [1, 0, 0], bandpass: [0, 1, 0], highpass: [0, 0, 1] };

/** A filter memory this near to nothing is nothing. */
const TINY = 1e-18;

/** Damping of the second stage of the 24 dB low-pass (no peak of its own). */
export const FLAT = 1.4142135623730951;

/**
 * @param {string} type - `lowpass`, `lowpass24`, `bandpass` or `highpass`
 * @returns {number[]} `[low, band, high]` weights; an unknown type is a low-pass
 */
export function filterMix(type) {
  return MIX[type] || MIX.lowpass;
}

/**
 * @param {number} hertz
 * @param {number} sampleRate
 * @returns {number} The filter's frequency coefficient `g`, cutoff kept
 *   between 16 Hz and 0.45 of the sample rate
 */
export function cutoffCoefficient(hertz, sampleRate) {
  const top = 0.45 * sampleRate;
  return tanHalf((hertz > top ? top : hertz > 16 ? hertz : 16) / sampleRate);
}

/**
 * @param {number} resonance - 0 … 1
 * @returns {number} Damping `k` = 1/Q: Q runs from 0.5 to 25
 */
export function damping(resonance) {
  const r = resonance > 1 ? 1 : resonance > 0 ? resonance : 0;
  return 2 * exp(-r * LN50);
}

/** The natural logarithm of 50: resonance 1 is fifty times the Q of 0. */
const LN50 = 3.912023005428146;

/**
 * Filter a buffer in place.
 * @param {Float64Array} buf
 * @param {number} count
 * @param {Float64Array} state - Two numbers per stage, kept between calls
 * @param {number} slot
 * @param {number} g - From `cutoffCoefficient`
 * @param {number} k - From `damping`
 * @param {number} low - Weight of the low-pass output
 * @param {number} band - Weight of the band-pass output
 * @param {number} high - Weight of the high-pass output
 * @param {number} [slope] - What `g` grows by every sample, for a cutoff
 *   that glides to its next value instead of jumping
 */
export function svf(buf, count, state, slot, g, k, low, band, high, slope = 0) {
  let s1 = state[slot];
  let s2 = state[slot + 1];
  let a1 = 1 / (1 + g * (g + k));
  let a2 = g * a1;
  let a3 = g * a2;
  for (let i = 0; i < count; i++) {
    const v0 = buf[i];
    const v3 = v0 - s2;
    const v1 = a1 * s1 + a2 * v3;
    const v2 = s2 + a2 * s1 + a3 * v3;
    s1 = 2 * v1 - s1;
    s2 = 2 * v2 - s2;
    buf[i] = low * v2 + band * v1 + high * (v0 - k * v1 - v2);
    // A gliding cutoff is moved on every fourth sample: fine enough steps
    // to be smooth, at a quarter of the divisions.
    if (slope !== 0 && (i & 3) === 3) {
      g += slope * 4;
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
  }
  // What has all but died away is dropped: numbers that small are slow.
  state[slot] = s1 < TINY && s1 > -TINY ? 0 : s1;
  state[slot + 1] = s2 < TINY && s2 > -TINY ? 0 : s2;
}
