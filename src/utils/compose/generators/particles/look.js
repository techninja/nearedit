/**
 * The look of a particle at an age: its size, opacity and turning, each a
 * closed-form function of how much of its life it has lived and of its own
 * random numbers. Isomorphic and pure.
 * Reference: docs/app-spec/PARTICLES.md § Look.
 * @module utils/compose/generators/particles/look
 */

import { rand } from '#utils/compose/random.js';
import { ease } from '#utils/edl/easing.js';
import { KEY } from './keys.js';

const RAD = Math.PI / 180;
const TURN = Math.PI * 2;
/**
 * Width of the band of `density` over which one particle fades instead of
 * popping: with density moving from 0 to 1, each particle takes a tenth of
 * that range to appear.
 */
export const FEATHER = 0.1;

/**
 * What stays the same for every particle of a frame.
 * @typedef {ReturnType<typeof lookOf>} Look
 */

/**
 * @param {Record<string, any>} p - Resolved parameters
 */
export function lookOf(p) {
  return {
    size: /** @type {number} */ (p.size),
    sizeJitter: /** @type {number} */ (p.sizeJitter),
    sizeStart: /** @type {number} */ (p.sizeStart),
    sizeEnd: /** @type {number} */ (p.sizeEnd),
    sizeCurve: /** @type {string} */ (p.sizeCurve),
    opacity: /** @type {number} */ (p.opacity),
    fadeIn: /** @type {number} */ (p.fadeIn),
    fadeOut: /** @type {number} */ (p.fadeOut),
    density: /** @type {number} */ (p.density),
    twinkle: /** @type {number} */ (p.twinkle),
    twinkleSpeed: /** @type {number} */ (p.twinkleSpeed),
    rotation: p.rotation * RAD,
    rotationSpread: p.rotationSpread * RAD,
    spin: p.spin * RAD,
    spinSpread: p.spinSpread * RAD,
    flip: /** @type {number} */ (p.flip),
    turns: p.rotation !== 0 || p.rotationSpread > 0 || p.spin !== 0 || p.spinSpread > 0,
  };
}

/**
 * @param {Look} look
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} f - Share of its life lived, 0..1
 * @returns {number} Length of the sprite's longer side, output pixels
 */
export function sizeAt(look, seed, index, group, f) {
  const own = look.size * (1 - look.sizeJitter * rand(seed, index, KEY.SIZE, group));
  const grown = look.sizeStart + (look.sizeEnd - look.sizeStart) * ease(look.sizeCurve, f);
  return own * Math.max(0, grown);
}

/**
 * Opacity: the layer's opacity, faded in over the first share of the life
 * and out over the last, thinned by `density`, pulsing with `twinkle`.
 * @param {Look} look
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} f - Share of its life lived, 0..1
 * @param {number} age - Seconds since birth
 * @returns {number} 0..1
 */
export function alphaAt(look, seed, index, group, f, age) {
  let alpha = look.opacity;
  if (f < look.fadeIn) alpha *= f / look.fadeIn;
  if (1 - f < look.fadeOut) alpha *= (1 - f) / look.fadeOut;
  if (look.density < 1) {
    const rank = rand(seed, index, KEY.DENSITY, group) * (1 - FEATHER);
    alpha *= Math.max(0, Math.min(1, (look.density - rank) / FEATHER));
  }
  if (look.twinkle > 0 && alpha > 0) {
    const rate = look.twinkleSpeed * (0.5 + rand(seed, index, KEY.TWINKLE_RATE, group));
    const phase = rand(seed, index, KEY.TWINKLE_PHASE, group);
    alpha *= 1 - look.twinkle * (0.5 - 0.5 * Math.cos(TURN * (rate * age + phase)));
  }
  return alpha;
}

/**
 * How far a particle has turned: its own starting angle plus its own spin.
 * @param {Look} look
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} age - Seconds since birth
 * @returns {number} Radians, clockwise
 */
export function angleAt(look, seed, index, group, age) {
  const start =
    look.rotation + (rand(seed, index, KEY.ROTATION, group) - 0.5) * look.rotationSpread;
  const spin = look.spin + (rand(seed, index, KEY.SPIN, group) - 0.5) * look.spinSpread;
  return start + spin * age;
}

/**
 * The tumble of a particle: how much of its face is turned to the viewer.
 * @param {Look} look
 * @param {number} seed
 * @param {number} index
 * @param {number} group
 * @param {number} age - Seconds since birth
 * @returns {number} -1..1; negative shows the back (the sprite mirrored)
 */
export function flipAt(look, seed, index, group, age) {
  const rate = look.flip * (0.5 + rand(seed, index, KEY.FLIP_RATE, group));
  return Math.cos(TURN * (rate * age + rand(seed, index, KEY.FLIP_PHASE, group)));
}
