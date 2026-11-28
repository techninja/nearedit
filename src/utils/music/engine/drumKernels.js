/**
 * The sources of a drum voice. Like the oscillator kernels, each adds
 * `count` samples to a buffer and keeps what it must remember in slots of a
 * state array. Isomorphic and pure.
 * @module utils/music/engine/drumKernels
 */

import { NOISE_SCALE, sinTurn, softClip } from './math.js';

/**
 * A tone whose pitch falls to rest and whose level dies away. State:
 * phase, level, how far above rest the pitch still is.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {{ inc: number, sweepCoef: number, decayCoef: number, gain: number, triangle: boolean }} tone
 */
export function fallingTone(out, count, state, slot, tone) {
  let p = state[slot];
  let level = state[slot + 1];
  let above = state[slot + 2];
  const { inc, sweepCoef, decayCoef, triangle } = tone;
  for (let i = 0; i < count; i++) {
    const wave = triangle ? 1 - 4 * (p < 0.5 ? 0.5 - p : p - 0.5) : sinTurn(p);
    out[i] += wave * level;
    p += inc * (1 + above);
    if (p >= 1) p -= 1;
    level *= decayCoef;
    above *= sweepCoef;
  }
  state[slot] = p;
  state[slot + 1] = level;
  state[slot + 2] = above;
}

/**
 * White noise with its envelope: it swells in over `attack` samples, may
 * start again `bursts` times `gap` samples apart, then rings out. State:
 * level, samples since the hit.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Int32Array} seeds
 * @param {Float64Array} state
 * @param {number} slot
 * @param {{ decayCoef: number, burstCoef: number, bursts: number, gap: number, attack: number }} noise
 */
export function noiseBurst(out, count, seeds, state, slot, noise) {
  let x = seeds[0];
  let level = state[slot];
  let age = state[slot + 1];
  const { decayCoef, burstCoef, gap, attack } = noise;
  const clapping = noise.bursts * gap;
  for (let i = 0; i < count; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    if (age < clapping && age > 0 && age % gap === 0) level = 1;
    const swell = age < attack ? age / attack : 1;
    out[i] += x * NOISE_SCALE * level * swell;
    level *= age < clapping ? burstCoef : decayCoef;
    age++;
  }
  seeds[0] = x;
  state[slot] = level;
  state[slot + 1] = age;
}

/**
 * Multiply a buffer by a level that dies away. State: the level.
 * @param {Float64Array} buf
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {number} coef
 */
export function fade(buf, count, state, slot, coef) {
  let level = state[slot];
  for (let i = 0; i < count; i++) {
    buf[i] *= level;
    level *= coef;
  }
  state[slot] = level;
}

/**
 * Drive and the sampler's grit: a soft clip, then — when the patch crushes —
 * a sample-and-hold at the sampler's rate, rounded to its bit depth. State:
 * the crusher's clock, the held value.
 * @param {Float64Array} buf
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {{ pre: number, post: number, hold: number, steps: number }} patch
 */
export function colour(buf, count, state, slot, patch) {
  const { pre, post, hold, steps } = patch;
  for (let i = 0; i < count && pre; i++) buf[i] = softClip(buf[i] * pre) * post;
  if (!hold) return;
  let clock = state[slot];
  let held = state[slot + 1];
  for (let i = 0; i < count; i++) {
    clock += hold;
    if (clock >= 1) {
      clock -= 1;
      held = Math.round(buf[i] * steps) / steps;
    }
    buf[i] = held;
  }
  state[slot] = clock;
  state[slot + 1] = held;
}
