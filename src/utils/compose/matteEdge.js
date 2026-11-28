/**
 * Moving and softening the edge of a matte. A matte's edge is a ramp; its
 * greys say how far each pixel is from the edge, so the edge can be moved
 * and drawn harder or softer by a table look-up alone (`matteCurve`) — as
 * long as the ramp reaches as far as the edge is to move, and is at least
 * as soft as the edge is to become. When it is not, the matte is blurred
 * first, by a blur that is measured (`blurMeasure.js`), not trusted.
 * The cutout's matte pass and the outline effect both shape an edge here.
 * Isomorphic. Reference: docs/app-spec/CUTOUT.md § Drawing.
 * @module utils/compose/matteEdge
 */

import { blurFor } from './blurMeasure.js';
import { matteCurve } from './matteCurve.js';

/** A step blurred by a Gaussian is a ramp about this many deviations wide. */
export const RAMP = 2.5;
/** The hardest edge: a ramp of one pixel. */
export const HARDEST = 1 / RAMP;
/** However a picture is reduced or drawn, an edge keeps about this deviation, pixels. */
export const FOOTPRINT = 0.4;
/** An edge can be moved this many deviations of its ramp; further needs a softer matte first. */
const REACH = 1.3;
/** A blur below this many pixels changes nothing worth its cost. */
const LEAST_BLUR = 0.25;

/**
 * @typedef {Object} EdgeShape
 * @property {number} blur - Deviation to blur the matte by first, pixels; 0 = none
 * @property {Uint8Array} curve - Alpha for each grey of the (blurred) matte
 */

/**
 * How to shape an edge. All lengths are in pixels of the canvas the matte
 * is on.
 * @param {number} soft - Deviation the edge is to have (a ramp `RAMP` times as wide)
 * @param {number} move - How far to pull the edge in (positive) or let it out
 * @param {number} native - Deviation of the matte's edge as it is
 * @param {import('./host.js').ComposeEnv} env - Blurs are measured on its canvases
 * @returns {EdgeShape}
 */
export function edgeShape(soft, move, native, env) {
  const wanted = Math.max(soft, HARDEST);
  // Softer than the matte is, or moved further than its ramp reaches: blur it first.
  const needed = Math.max(wanted, Math.abs(move) / REACH);
  const extra = needed > native ? Math.sqrt(needed * needed - native * native) : 0;
  const blur = extra >= LEAST_BLUR ? blurFor(extra, env) : { ask: 0, got: 0 };
  const has = Math.hypot(native, blur.got);
  return { blur: blur.ask, curve: matteCurve(has / wanted, move / wanted) };
}
