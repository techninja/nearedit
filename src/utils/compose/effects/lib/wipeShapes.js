/**
 * The masks of the wipe effect: for each shape, the gradient fills whose
 * alpha says how much of the layer is revealed at a given progress. Every
 * mask is nothing at progress 0, everything at 1, and moves evenly between;
 * its edge is an S-curve `feather` pixels wide (never less than a pixel, so
 * a hard wipe still has a clean edge).
 * Isomorphic.
 * @module utils/compose/effects/lib/wipeShapes
 */

import { cornersFrom, opacityStops, smooth, spread } from './soft.js';

/**
 * @typedef {Object} Wipe
 * @property {number} progress - 0..1
 * @property {number} angle - Degrees
 * @property {number} feather - Canvas pixels, at least 1
 * @property {number} x - Centre, canvas pixels
 * @property {number} y
 * @property {number} width - Frame size, canvas pixels
 * @property {number} height
 */

const radians = (/** @type {number} */ degrees) => (degrees * Math.PI) / 180;

/**
 * A straight edge travelling across the frame in the direction of `angle`
 * (0° left to right, 90° top to bottom); what it has passed is revealed.
 * @param {any} ctx
 * @param {Wipe} w
 * @returns {any[]} Gradients to fill the frame with, multiplied together
 */
export function linear(ctx, w) {
  const ux = Math.cos(radians(w.angle));
  const uy = Math.sin(radians(w.angle));
  const half = (Math.abs(w.width * ux) + Math.abs(w.height * uy)) / 2;
  // The edge's soft band starts wholly before the frame and ends wholly past it.
  const edge = -half - w.feather / 2 + w.progress * (half * 2 + w.feather);
  const at = (/** @type {number} */ t) => [w.width / 2 + ux * t, w.height / 2 + uy * t];
  const [x0, y0] = at(edge - w.feather / 2);
  const [x1, y1] = at(edge + w.feather / 2);
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  opacityStops(gradient, (p) => 1 - smooth(p), spread(0, 1));
  return [gradient];
}

/**
 * A circle growing from the centre until it holds the whole frame.
 * @param {any} ctx
 * @param {Wipe} w
 * @returns {any[]} Gradients to fill the frame with, multiplied together
 */
export function radial(ctx, w) {
  const far = Math.max(
    ...cornersFrom(w.width, w.height, w.x, w.y).map(([dx, dy]) => Math.hypot(dx, dy)),
  );
  const radius = -w.feather / 2 + w.progress * (far + w.feather);
  const outer = radius + w.feather / 2;
  const gradient = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, outer);
  const inner = Math.max(0, radius - w.feather / 2) / outer;
  opacityStops(
    gradient,
    (p) => 1 - smooth((p * outer - radius) / w.feather + 0.5),
    spread(inner, 1),
  );
  return [gradient];
}

/**
 * A box opening from the centre, with the frame's proportions; `angle`
 * turns it (45° makes a diamond). Two crossed bands, multiplied.
 * @param {any} ctx
 * @param {Wipe} w
 * @returns {any[]} Gradients to fill the frame with, multiplied together
 */
export function iris(ctx, w) {
  const corners = cornersFrom(w.width, w.height, w.x, w.y);
  return [0, 90].map((turn) => {
    const ux = Math.cos(radians(w.angle + turn));
    const uy = Math.sin(radians(w.angle + turn));
    const far = Math.max(...corners.map(([dx, dy]) => Math.abs(dx * ux + dy * uy)));
    const half = -w.feather / 2 + w.progress * (far + w.feather);
    const reach = half + w.feather / 2;
    const gradient = ctx.createLinearGradient(
      w.x - ux * reach,
      w.y - uy * reach,
      w.x + ux * reach,
      w.y + uy * reach,
    );
    // Position p along the band is at distance |2p − 1| · reach from its middle.
    const band = (/** @type {number} */ p) =>
      1 - smooth((Math.abs(2 * p - 1) * reach - half) / w.feather + 0.5);
    const knee = Math.max(0, half - w.feather / 2) / reach / 2;
    opacityStops(gradient, band, [...spread(0, 0.5 - knee), ...spread(0.5 + knee, 1)]);
    return gradient;
  });
}

/**
 * A clock hand sweeping clockwise from `angle` (0° is 12 o'clock). The
 * feather is an angle: `feather` pixels wide half-way out to the farthest
 * corner. Both sides of the revealed wedge are soft, and the two meet
 * seamlessly when the sweep closes.
 * @param {any} ctx
 * @param {Wipe} w
 * @returns {any[]} Gradients to fill the frame with, multiplied together
 */
export function clock(ctx, w) {
  const far = Math.max(
    ...cornersFrom(w.width, w.height, w.x, w.y).map(([dx, dy]) => Math.hypot(dx, dy)),
  );
  const soft = Math.min(0.5, w.feather / (Math.PI * far));
  // A wedge from 0 to `progress` of a turn, softened; summed around the circle.
  const wedge = (/** @type {number} */ t) =>
    smooth(t / soft + 0.5) - smooth((t - w.progress) / soft + 0.5);
  const around = (/** @type {number} */ t) => wedge(t - 1) + wedge(t) + wedge(t + 1);
  const wrap = (/** @type {number} */ t) => t - Math.floor(t);
  const positions = [
    0,
    1,
    ...spread(-soft / 2, soft / 2).map(wrap),
    ...spread(w.progress - soft / 2, w.progress + soft / 2).map(wrap),
  ].sort((a, b) => a - b);
  const gradient = ctx.createConicGradient(radians(w.angle - 90), w.x, w.y);
  opacityStops(gradient, around, positions);
  return [gradient];
}

/** The shapes by name. */
export const WIPE_SHAPES = { linear, radial, iris, clock };
