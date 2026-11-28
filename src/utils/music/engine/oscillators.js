/**
 * Oscillator kernels. Each adds `count` samples of one oscillator to a
 * buffer and keeps its phase (in turns, 0 … 1) in a slot of a state array,
 * so a voice can be rendered in pieces of any size. Saw and pulse are
 * band-limited with a four-point polynomial step (the integral of a cubic
 * B-spline replaces every jump), the triangle with a two-point corner, so
 * high notes do not fold back as false tones. Isomorphic and pure.
 * @module utils/music/engine/oscillators
 */

import { NOISE_SCALE, sinTurn } from './math.js';

/**
 * What a band-limited unit step differs from an ideal one by.
 * @param {number} t - Samples since the step, −2 … 2
 * @returns {number}
 */
function stepResidual(t) {
  if (t >= 0) {
    if (t < 1) return -0.5 + t * (2 / 3) + t * t * t * (t * 0.125 - 1 / 3);
    const u = (2 - t) * (2 - t);
    return (-u * u) / 24;
  }
  if (t > -1) return 0.5 + t * (2 / 3) - t * t * t * (t * 0.125 + 1 / 3);
  const u = (2 + t) * (2 + t);
  return (u * u) / 24;
}

/**
 * A saw: a ramp from −1 up to +1 that drops back once a period.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot - Where the phase lives
 * @param {number} inc - Turns per sample, below 0.25
 * @param {number} gain
 */
export function saw(out, count, state, slot, inc, gain) {
  let p = state[slot];
  const edge = 2 * inc;
  for (let i = 0; i < count; i++) {
    let y = 2 * p - 1;
    if (p < edge) y -= 2 * stepResidual(p / inc);
    else if (p > 1 - edge) y -= 2 * stepResidual((p - 1) / inc);
    out[i] += y * gain;
    p += inc;
    if (p >= 1) p -= 1;
  }
  state[slot] = p;
}

/**
 * A pulse: +1 for `width` of the period, −1 for the rest, without its mean.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {number} inc
 * @param {number} gain
 * @param {number} width - 0.05 … 0.95
 */
export function pulse(out, count, state, slot, inc, gain, width) {
  let p = state[slot];
  const edge = 2 * inc;
  const mean = 2 * width - 1;
  for (let i = 0; i < count; i++) {
    let y = (p < width ? 1 : -1) - mean;
    if (p < edge) y += 2 * stepResidual(p / inc);
    else if (p > 1 - edge) y += 2 * stepResidual((p - 1) / inc);
    let d = p - width;
    if (d > 0.5) d -= 1;
    else if (d < -0.5) d += 1;
    if (d < edge && d > -edge) y -= 2 * stepResidual(d / inc);
    out[i] += y * gain;
    p += inc;
    if (p >= 1) p -= 1;
  }
  state[slot] = p;
}

/**
 * A triangle, −1 at phase 0 and +1 at phase 0.5.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {number} inc
 * @param {number} gain
 */
export function triangle(out, count, state, slot, inc, gain) {
  let p = state[slot];
  const corner = (8 * inc) / 6;
  for (let i = 0; i < count; i++) {
    const d = p < 0.5 ? 0.5 - p : p - 0.5;
    let y = 1 - 4 * d;
    if (d < inc) {
      const u = 1 - d / inc;
      y -= corner * u * u * u;
    } else if (d > 0.5 - inc) {
      const u = 1 - (0.5 - d) / inc;
      y += corner * u * u * u;
    }
    out[i] += y * gain;
    p += inc;
    if (p >= 1) p -= 1;
  }
  state[slot] = p;
}

/**
 * A sine. With `mod`, another oscillator's samples bend its phase by up to
 * `depth` turns (phase modulation — the bell and electric-piano sound).
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {number} inc
 * @param {number} gain
 * @param {Float64Array} [mod]
 * @param {number} [depth]
 */
export function sine(out, count, state, slot, inc, gain, mod, depth = 0) {
  let p = state[slot];
  for (let i = 0; i < count && !mod; i++) {
    out[i] += sinTurn(p) * gain;
    p += inc;
    if (p >= 1) p -= 1;
  }
  for (let i = 0; i < count && mod; i++) {
    const bent = p + depth * mod[i];
    out[i] += sinTurn(bent - Math.floor(bent)) * gain;
    p += inc;
    if (p >= 1) p -= 1;
  }
  state[slot] = p;
}

/**
 * White noise from the voice's own generator.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Int32Array} seeds
 * @param {number} slot - Where the generator's state lives
 * @param {number} gain
 */
export function noise(out, count, seeds, slot, gain) {
  let x = seeds[slot];
  const scale = gain * NOISE_SCALE;
  for (let i = 0; i < count; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] += x * scale;
  }
  seeds[slot] = x;
}
