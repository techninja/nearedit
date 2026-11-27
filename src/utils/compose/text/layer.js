/**
 * Layer helpers for titles: how big a unit of a placed context is on the
 * canvas, and copying just the part of a pooled layer that a text block
 * occupies. Isomorphic.
 * @module utils/compose/text/layer
 */

/**
 * Canvas pixels per unit of the context's current coordinate system (the
 * geometric mean of its two axes). Filters and shadows ignore the
 * transform, so their lengths are multiplied by this.
 * @param {any} ctx
 * @returns {number}
 */
export function unitScale(ctx) {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

/**
 * Copy the part of a layer that holds a text block onto a context, pixel
 * for pixel, clipped to that part plus `spill`. Copying the whole layer
 * would look the same, but a shadow, a blur or a fade costs as much as the
 * area it may touch, and a title is usually a small part of the frame.
 * The caller restores the context (the clip stays set).
 * @param {any} ctx - Destination; its transform must be the identity
 * @param {import('../pool.js').Surface} layer - Same size as the destination
 * @param {{ m: { a: number, b: number, c: number, d: number, e: number, f: number },
 *   box: { x: number, y: number, width: number, height: number }, margin: number }} area -
 *   The block's box in layout units, the transform that placed it, and how
 *   far ink may reach beyond the box
 * @param {number} [spill=0] - Canvas pixels a shadow or blur set on the
 *   context reaches beyond the copied part
 */
export function drawLayer(ctx, layer, { m, box, margin }, spill = 0) {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [box.x - margin, box.x + box.width + margin]) {
    for (const y of [box.y - margin, box.y + box.height + margin]) {
      const px = m.a * x + m.c * y + m.e;
      const py = m.b * x + m.d * y + m.f;
      [left, top] = [Math.min(left, px), Math.min(top, py)];
      [right, bottom] = [Math.max(right, px), Math.max(bottom, py)];
    }
  }
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const width = Math.min(layer.width, Math.ceil(right)) - x;
  const height = Math.min(layer.height, Math.ceil(bottom)) - y;
  if (!(width > 0 && height > 0)) return;
  const reach = Math.ceil(spill);
  ctx.beginPath();
  ctx.rect(x - reach, y - reach, width + reach * 2, height + reach * 2);
  ctx.clip();
  ctx.drawImage(layer.canvas, x, y, width, height, x, y, width, height);
}
