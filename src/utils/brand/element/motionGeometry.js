/**
 * The geometry of two motions: how far a slide travels, and between which
 * progress values a wipe crosses a layer's box. Isomorphic and pure.
 * @module utils/brand/element/motionGeometry
 */

import { num } from './measure.js';
import { SLIDE_UNITS } from './vocabulary.js';

/** @typedef {import('./timing.js').Move} Move */
/** @typedef {import('./box.js').Box} Box */

/**
 * How far a slide travels, output pixels: the design's units, or — `out` —
 * as far as it takes to be outside the frame on that side.
 * @param {Move} move
 * @param {[number, number]} side - Which way the outside lies: [x, y]
 * @param {Box} box
 * @param {{ frame: { width: number, height: number }, unit: number }} env
 * @returns {number}
 */
export function travelOf(move, side, box, env) {
  if (move.travel !== 'out') return num(move.travel, SLIDE_UNITS, 0, 400) * env.unit;
  if (side[0]) return side[0] > 0 ? env.frame.width - box.x : box.x + box.w;
  return side[1] > 0 ? env.frame.height - box.y : box.y + box.h;
}

/**
 * The progress values between which a linear wipe crosses a box.
 * @param {number} angle - Degrees
 * @param {number} feather - Output pixels
 * @param {Box} box
 * @param {{ width: number, height: number }} frame
 * @returns {[number, number]} Nothing of the box shown … all of it shown
 */
export function wipeRange(angle, feather, box, frame) {
  const [ux, uy] = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const half = (Math.abs(frame.width * ux) + Math.abs(frame.height * uy)) / 2;
  const along = [0, 1].flatMap((i) =>
    [0, 1].map(
      (j) =>
        (box.x + i * box.w - frame.width / 2) * ux + (box.y + j * box.h - frame.height / 2) * uy,
    ),
  );
  const at = (/** @type {number} */ t) => Math.max(0, Math.min(1, t / (half * 2 + feather)));
  return [at(Math.min(...along) + half), at(Math.max(...along) + half + feather)];
}
