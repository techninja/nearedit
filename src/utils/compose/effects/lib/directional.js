/**
 * Directional (motion) blur with what every canvas shares: whole-pixel
 * copies, `globalAlpha` and `lighter`. The layer is averaged with shifted
 * copies of itself, doubling the reach at every step: two one-pixel
 * averages that make a (¼, ½, ¼) pass, then pairs of copies 1, 2, 4…
 * pixels to either side, then one last pair that brings the streak to its
 * exact length. A streak 2ⁿ pixels long costs about 2n + 6 copies, not 2ⁿ.
 * Every shift is a whole number of canvas pixels: nothing is resampled, the
 * picture stays sharp across the direction of travel, and both canvases
 * compute the same bytes.
 *
 * The averaging cannot drift (`lib/average.js`): an opaque pixel stays
 * opaque and a flat colour stays exactly itself, however long the streak.
 * Isomorphic.
 * @module utils/compose/effects/lib/directional
 */

import { extendEdges, padFor } from '#utils/compose/filterPass.js';
import { averageInto } from './average.js';

/** Doubling steps are capped here: a streak of at most 2¹¹ pixels each way. */
const MAX_STEPS = 10;

/**
 * The pairs of shifts that make up a streak. They are counted along the
 * axis the direction mostly follows, where every shift is exact; the other
 * axis gets the nearest whole pixel.
 * @param {number} reach - How far the streak extends each way, canvas pixels
 * @param {number} angle - Direction, degrees clockwise from "to the right"
 * @returns {{ pairs: number[][][], pad: number }} Each pair is the two
 *   `[x, y]` shifts of one averaging step; `pad` is how far the result
 *   samples beyond a pixel
 */
export function streakSteps(reach, angle) {
  const radians = (angle * Math.PI) / 180;
  const x = Math.cos(radians);
  const y = Math.sin(radians);
  const major = Math.max(Math.abs(x), Math.abs(y));
  const along = Math.max(1, reach * major);
  const doublings = Math.min(MAX_STEPS, Math.floor(Math.log2(along)));
  /** @type {(distance: number) => number[]} */
  const shift = (distance) => [
    Math.round((distance * x) / major),
    Math.round((distance * y) / major),
  ];
  const both = (/** @type {number[]} */ [sx, sy]) => [
    [sx, sy],
    [0 - sx, 0 - sy],
  ];
  const one = shift(1);
  // Averaging with the next pixel, then with the previous one: ¼, ½, ¼.
  const pairs = [
    [[0, 0], one],
    [[0, 0], both(one)[1]],
  ];
  for (let i = 0; i < doublings; i++) pairs.push(both(shift(2 ** i)));
  // What is left after the doublings: nothing, up to as much again.
  const rest = Math.min(Math.round(along - 2 ** doublings), 2 ** doublings);
  if (rest > 0) pairs.push(both(shift(rest)));
  const pad = pairs.reduce((sum, [, [sx, sy]]) => sum + Math.max(Math.abs(sx), Math.abs(sy)), -1);
  return { pairs, pad };
}

/**
 * Blur a surface along a direction, in place.
 * @param {import('#utils/compose/pool.js').Surface} surface
 * @param {number} reach - How far the streak extends each way, canvas pixels
 * @param {number} angle - Degrees clockwise from "to the right"
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 */
export function directionalBlur(surface, reach, angle, env) {
  if (!(reach >= 0.5)) return;
  const { pairs, pad: far } = streakSteps(reach, angle);
  const { width, height } = surface;
  // Repeat the edge pixels outward so the streak does not fade at the frame's border.
  const pad = padFor(far);
  let from = env.scratch(width + pad * 2, height + pad * 2);
  let to = env.scratch(from.width, from.height);
  extendEdges(from.ctx, surface.canvas, width, height, pad);
  pairs.forEach((pair, i) => {
    if (i > 0) {
      [from, to] = [to, from];
      to.ctx.reset();
    }
    averageInto(
      to.ctx,
      (ctx) => ctx.drawImage(from.canvas, pair[0][0], pair[0][1]),
      (ctx) => ctx.drawImage(from.canvas, pair[1][0], pair[1][1]),
    );
  });
  const { ctx } = surface;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(to.canvas, -pad, -pad);
}
