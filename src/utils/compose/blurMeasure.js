/**
 * What a canvas blur really does. `filter: blur(σ)` is not exact: a
 * software canvas builds it from box blurs whose width is a whole number
 * of pixels, so below about 0.8 px it does nothing at all and up to a few
 * pixels it lands on the nearest of a handful of widths (0.8 … 1.3 px all
 * give 1.08); an accelerated canvas blurs closer to what was asked. Where a
 * blur is only for looks that does not matter. Where arithmetic is built
 * on it — moving a matte's edge by reading its ramp — it does, so the blur
 * is measured: a step from black to white is blurred on the host's own
 * canvas and the deviation of the ramp that comes out is read back. Each
 * measurement is a canvas a few dozen pixels wide, made once per blur and
 * host and remembered.
 * Isomorphic.
 * @module utils/compose/blurMeasure
 */

import { reduceLevel } from './effects/lib/reduce.js';

/** Blurs are asked for in steps of this, pixels, so that few are ever measured. */
const GRID = 1 / 8;
/** A blur that reaches this share of what was wanted is taken. */
const NEAR_ENOUGH = 0.9;
const MAX_TRIES = 8;
const MAX_KNOWN = 512;

/** @typedef {{ ask: number, got: number }} Blur - Deviation to ask the canvas for, and what it gives */

/** @type {WeakMap<object, Map<number, number>>} Measured deviation by asked deviation, per host */
const measured = new WeakMap();
/** @type {WeakMap<object, Map<number, Blur>>} */
const chosen = new WeakMap();

/**
 * @template T
 * @param {WeakMap<object, Map<number, T>>} store
 * @param {object} env
 * @returns {Map<number, T>} What is known for this host, emptied when it grows large
 */
function known(store, env) {
  let map = store.get(env);
  if (!map || map.size >= MAX_KNOWN) store.set(env, (map = new Map()));
  return map;
}

/**
 * Blur a step and read the deviation of its ramp.
 * @param {number} sigma - Asked for, pixels; under 12
 * @param {import('./host.js').ComposeEnv} env
 * @returns {number} Pixels; 0 when the canvas left the step as it was
 */
function measure(sigma, env) {
  const half = Math.ceil(sigma * 4) + 4;
  const [width, height] = [half * 2, Math.ceil(sigma * 2) * 2 + 2];
  const step = env.scratch(width, height);
  step.ctx.fillStyle = '#000000';
  step.ctx.fillRect(0, 0, half, height);
  step.ctx.fillStyle = '#ffffff';
  step.ctx.fillRect(half, 0, half, height);
  const out = env.scratch(width, height, true);
  out.ctx.filter = `blur(${sigma}px)`;
  out.ctx.drawImage(step.canvas, 0, 0);
  const { data } = out.ctx.getImageData(0, height >> 1, width, 1);
  // The ramp's slope is the blur's own shape: its spread is the deviation.
  let [sum, first, second] = [0, 0, 0];
  for (let x = 1; x < width; x++) {
    const rise = data[x * 4 + 1] - data[x * 4 - 3];
    sum += rise;
    first += rise * x;
    second += rise * x * x;
  }
  if (!(sum > 0)) return 0;
  const mean = first / sum;
  return Math.sqrt(Math.max(0, second / sum - mean * mean));
}

/**
 * The deviation a Gaussian blur of the pipeline really has on this host
 * (`effects/blur.js` `gaussianBlur`, which works on a reduced copy from 12
 * pixels up).
 * @param {number} sigma - Asked for, canvas pixels
 * @param {import('./host.js').ComposeEnv} env
 * @returns {number}
 */
export function blurDeviation(sigma, env) {
  if (!(sigma > 0)) return 0;
  const factor = 2 ** reduceLevel(sigma);
  const map = known(measured, env);
  const asked = sigma / factor;
  if (!map.has(asked)) map.set(asked, measure(asked, env));
  return map.get(asked) * factor;
}

/**
 * The blur to ask for when a matte has to be softened by at least `wanted`.
 * @param {number} wanted - Deviation, canvas pixels
 * @param {import('./host.js').ComposeEnv} env
 * @returns {Blur} `ask` is on a grid of an eighth of a pixel; `got` is what
 *   it measures as — at least nine tenths of `wanted`
 */
export function blurFor(wanted, env) {
  const first = Math.ceil(wanted / GRID) * GRID;
  const map = known(chosen, env);
  let found = map.get(first);
  if (found) return found;
  let ask = first;
  let got = blurDeviation(ask, env);
  for (let i = 0; i < MAX_TRIES && got < wanted * NEAR_ENOUGH; i++) {
    ask = Math.ceil((ask * 1.2) / GRID) * GRID;
    got = blurDeviation(ask, env);
  }
  found = { ask, got };
  map.set(first, found);
  return found;
}
