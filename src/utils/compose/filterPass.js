/**
 * Filter passes — draw a surface through a CSS-style `filter`. A filter that
 * reaches beyond each pixel (a blur) would otherwise fade to transparent at
 * the border of the frame, darkening the edges of full-frame footage. To
 * prevent that the surface's edge pixels are repeated outward first, by as
 * far as the filter reaches: where the picture runs to the edge it simply
 * continues, where the edge is transparent nothing changes.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Layer pipeline.
 * @module utils/compose/filterPass
 */

/** Padding is never larger than this, canvas pixels. */
export const MAX_PAD = 512;

/**
 * Padding for a reach, in a few fixed steps so that an animated radius
 * reuses the same pooled canvases.
 * @param {number} reach - Canvas pixels the filter samples beyond a pixel
 * @returns {number} 0, or a power of two from 16 to MAX_PAD
 */
export function padFor(reach) {
  if (!(reach > 0)) return 0;
  let pad = 16;
  while (pad < reach && pad < MAX_PAD) pad *= 2;
  return pad;
}

/**
 * Paint a canvas in the middle of a larger one and repeat its edge pixels
 * into the margin.
 * @param {any} ctx - Context of a canvas `width + 2·pad` by `height + 2·pad`
 * @param {any} canvas
 * @param {number} width
 * @param {number} height
 * @param {number} pad
 */
export function extendEdges(ctx, canvas, width, height, pad) {
  const far = { x: width + pad, y: height + pad };
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, pad, pad);
  ctx.drawImage(canvas, 0, 0, width, 1, pad, 0, width, pad);
  ctx.drawImage(canvas, 0, height - 1, width, 1, pad, far.y, width, pad);
  ctx.drawImage(canvas, 0, 0, 1, height, 0, pad, pad, height);
  ctx.drawImage(canvas, width - 1, 0, 1, height, far.x, pad, pad, height);
  ctx.drawImage(canvas, 0, 0, 1, 1, 0, 0, pad, pad);
  ctx.drawImage(canvas, width - 1, 0, 1, 1, far.x, 0, pad, pad);
  ctx.drawImage(canvas, 0, height - 1, 1, 1, 0, far.y, pad, pad);
  ctx.drawImage(canvas, width - 1, height - 1, 1, 1, far.x, far.y, pad, pad);
  ctx.imageSmoothingEnabled = true;
}

/**
 * Draw a surface through a filter onto a context of the same size.
 * @param {any} ctx - Destination; its transform must be the identity
 * @param {import('./pool.js').Surface} source
 * @param {string} filter - CSS filter list, e.g. `blur(12px)`
 * @param {number} reach - Canvas pixels the filter samples beyond a pixel; 0
 *   for filters that only change colours
 * @param {import('./host.js').ComposeEnv} env
 */
export function drawFiltered(ctx, source, filter, reach, env) {
  const pad = padFor(reach);
  let from = source;
  if (pad) {
    from = env.scratch(source.width + pad * 2, source.height + pad * 2);
    extendEdges(from.ctx, source.canvas, source.width, source.height, pad);
  }
  ctx.save();
  ctx.filter = filter;
  ctx.drawImage(from.canvas, -pad, -pad);
  ctx.restore();
}

/**
 * Replace a surface's picture with itself seen through a filter.
 * @param {import('./pool.js').Surface} surface
 * @param {string} filter
 * @param {number} reach
 * @param {import('./host.js').ComposeEnv} env
 */
export function filterInPlace(surface, filter, reach, env) {
  const pad = padFor(reach);
  const copy = env.scratch(surface.width + pad * 2, surface.height + pad * 2);
  if (pad) extendEdges(copy.ctx, surface.canvas, surface.width, surface.height, pad);
  else copy.ctx.drawImage(surface.canvas, 0, 0);
  const { ctx } = surface;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, surface.width, surface.height);
  ctx.filter = filter;
  ctx.drawImage(copy.canvas, -pad, -pad);
  ctx.restore();
}
