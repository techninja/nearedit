/**
 * The oscillators that need no band-limiting of their own: a sine (which
 * another oscillator may bend), white noise, and the cheap square of the
 * drum machine's metal. Like the kernels of `oscillators.js`, each adds
 * `count` samples to a buffer and keeps its phase in a slot of a state
 * array. Isomorphic and pure.
 * @module utils/music/engine/plainWaves
 */

import { NOISE_SCALE, sinTurn } from './math.js';

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

/**
 * A plain square for the metal of hats and cymbals, where a bank of them is
 * filtered until only its upper partials are left: its edges are smoothed
 * over two samples, which is all that such a sound needs.
 * @param {Float64Array} out
 * @param {number} count
 * @param {Float64Array} state
 * @param {number} slot
 * @param {number} inc
 */
export function square(out, count, state, slot, inc) {
  let p = state[slot];
  for (let i = 0; i < count; i++) {
    let y = p < 0.5 ? 1 : -1;
    const d = p < 0.5 ? p : p - 0.5;
    if (d < inc) {
      const t = d / inc;
      y += (p < 0.5 ? 1 : -1) * (t + t - t * t - 1);
    } else if (d > 0.5 - inc) {
      const t = (d - 0.5) / inc;
      y += (p < 0.5 ? -1 : 1) * (t * t + t + t + 1);
    }
    out[i] += y;
    p += inc;
    if (p >= 1) p -= 1;
  }
  state[slot] = p;
}
