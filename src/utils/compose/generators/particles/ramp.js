/**
 * The colours of a particle layer as a short list of steps. Over a life a
 * particle walks the list from the first colour to the last (`life`), or it
 * keeps one colour picked at random (`random`). Sprites are tinted once per
 * step and cached, so a frame never tints per particle.
 * Isomorphic and pure.
 * @module utils/compose/generators/particles/ramp
 */

import { parseColor } from '#utils/compose/color.js';
import { rand } from '#utils/compose/random.js';
import { KEY } from './keys.js';

/** Steps of a colour change over life: fine enough to look continuous. */
export const RAMP_STEPS = 32;

/**
 * @typedef {Object} Ramp
 * @property {string[]} fills - The colour of each step, `#rrggbb`
 * @property {number[]} alphas - The opacity of each step's colour, 0..1
 * @property {boolean} picked - Each particle keeps one step for life
 * @property {string} key - Names the fills, for caching
 */

const hex = (/** @type {number} */ v) => Math.round(v).toString(16).padStart(2, '0');

/**
 * @param {Record<string, any>} p - Resolved parameters
 * @returns {Ramp}
 */
export function rampOf(p) {
  const count = Math.round(p.colors);
  const stops = Array.from({ length: count }, (_, i) => parseColor(p[`color${i + 1}`]));
  const picked = p.colorMode === 'random';
  const flat = stops.every((stop) => stop.join() === stops[0].join());
  const steps = picked ? count : flat ? 1 : RAMP_STEPS;
  const fills = [];
  const alphas = [];
  for (let i = 0; i < steps; i++) {
    const at = steps > 1 ? (i / (steps - 1)) * (count - 1) : 0;
    const k = Math.max(0, Math.min(count - 2, Math.floor(at)));
    const [a, b] = [stops[k], stops[Math.min(count - 1, k + 1)]];
    const mix = at - k;
    fills.push(`#${[0, 1, 2].map((c) => hex(a[c] + (b[c] - a[c]) * mix)).join('')}`);
    alphas.push(a[3] + (b[3] - a[3]) * mix);
  }
  return { fills, alphas, picked, key: fills.join('') };
}

/**
 * The step a particle is on.
 * @param {Ramp} ramp
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} f - Share of its life lived, 0..1
 * @returns {number} Index into `fills` / `alphas`
 */
export function stepAt(ramp, seed, index, group, f) {
  const steps = ramp.fills.length;
  if (steps === 1) return 0;
  if (ramp.picked) return Math.floor(rand(seed, index, KEY.COLOR, group) * steps);
  return Math.round(f * (steps - 1));
}
