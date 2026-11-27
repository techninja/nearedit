/**
 * Working on a reduced copy. A wide blur costs the same however wide it is,
 * and its result holds no fine detail — so it can be made on a copy halved
 * a few times and enlarged again: the same picture for a fraction of the
 * work. The rule is `reduceLevel`: halve while the blur, measured in pixels
 * of the reduced copy, stays at least `floor` wide. For a Gaussian the
 * floor is 6: measured against the canvas's own full-size blur, a copy
 * blurred by 6 pixels or more is within 3 levels of it nearly everywhere
 * (99.9 % of values) and 0.3 on average, while below about 5.5 the two
 * drift apart by 10 and more on sharp detail. The rule depends on the blur
 * in canvas pixels, so a small preview may take the direct path where the
 * render takes the reduced one; both give the same picture.
 * Isomorphic.
 * @module utils/compose/effects/lib/reduce
 */

import { averageInto } from './average.js';

/** A copy is never halved more often than this (1/256 of the size). */
export const MAX_LEVELS = 8;

/**
 * How many times to halve for a blur.
 * @param {number} sigma - Standard deviation of the blur, canvas pixels
 * @param {number} [floor=6] - Smallest deviation allowed on the reduced
 *   copy, in its own pixels
 * @returns {number} 0 (work at full size) to MAX_LEVELS
 */
export function reduceLevel(sigma, floor = 6) {
  if (!(sigma >= floor * 2)) return 0;
  return Math.min(MAX_LEVELS, Math.floor(Math.log2(sigma / floor)));
}

/**
 * Repeat the right and bottom edge pixels of a picture out to a larger size.
 * @param {any} ctx - Context of the larger canvas
 * @param {{ canvas: any, width: number, height: number }} source
 * @param {number} width
 * @param {number} height
 */
function padToSize(ctx, source, width, height) {
  const { canvas, width: w, height: h } = source;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0);
  if (width > w) ctx.drawImage(canvas, w - 1, 0, 1, h, w, 0, width - w, h);
  if (height > h) ctx.drawImage(canvas, 0, h - 1, w, 1, 0, h, w, height - h);
  if (width > w && height > h) {
    ctx.drawImage(canvas, w - 1, h - 1, 1, 1, w, h, width - w, height - h);
  }
}

/**
 * Half the size, every pixel the exact average of 2 × 2 of the source. Not
 * a smooth `drawImage` — that rounds down every time and darkens a picture
 * by up to half a level per halving — but four unsmoothed picks, one per
 * pixel of each 2 × 2 block, averaged in pairs (`lib/average.js`).
 * @param {{ canvas: any, width: number, height: number }} source - Even width and height
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {import('#utils/compose/pool.js').Surface} A scratch surface
 */
export function halve(source, env) {
  const width = source.width / 2;
  const height = source.height / 2;
  /** @type {(dx: number, dy: number) => (ctx: any) => void} */
  const pick = (dx, dy) => (ctx) => {
    // At half scale, a quarter-pixel nudge puts each sample on one source pixel's centre.
    ctx.setTransform(0.5, 0, 0, 0.5, dx, dy);
    ctx.drawImage(source.canvas, 0, 0);
  };
  const rows = [0.25, -0.25].map((dy) => {
    const row = env.scratch(width, height);
    row.ctx.imageSmoothingEnabled = false;
    averageInto(row.ctx, pick(0.25, dy), pick(-0.25, dy));
    return row;
  });
  const out = env.scratch(width, height);
  averageInto(
    out.ctx,
    (ctx) => ctx.drawImage(rows[0].canvas, 0, 0),
    (ctx) => ctx.drawImage(rows[1].canvas, 0, 0),
  );
  out.ctx.globalAlpha = 1;
  out.ctx.globalCompositeOperation = 'source-over';
  return out;
}

/**
 * A copy of a surface halved `levels` times (see `halve`). A size that does
 * not divide evenly is first extended by repeating its edge pixels, so the
 * reduced copy has no half-covered border. One pixel of the result covers
 * `factor` × `factor` pixels of the source, from the top-left corner.
 * @param {import('#utils/compose/pool.js').Surface} source
 * @param {number} levels - 0..MAX_LEVELS
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 * @returns {{ surface: import('#utils/compose/pool.js').Surface, factor: number }}
 *   `surface` is `source` itself when `levels` is 0, a scratch surface otherwise
 */
export function reduce(source, levels, env) {
  const factor = 2 ** Math.max(0, Math.min(MAX_LEVELS, Math.round(levels)));
  if (factor === 1) return { surface: source, factor };
  const width = Math.ceil(source.width / factor) * factor;
  const height = Math.ceil(source.height / factor) * factor;
  let current = source;
  if (width !== source.width || height !== source.height) {
    current = env.scratch(width, height);
    padToSize(current.ctx, source, width, height);
  }
  for (let size = factor; size > 1; size /= 2) current = halve(current, env);
  return { surface: current, factor };
}

/**
 * Draw a reduced picture back at full size (smoothly interpolated).
 * @param {any} ctx - Destination; its transform must be the identity
 * @param {import('#utils/compose/pool.js').Surface} small
 * @param {number} factor - As `reduce` returned it
 */
export function enlarge(ctx, small, factor) {
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small.canvas, 0, 0, small.width * factor, small.height * factor);
}
