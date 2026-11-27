/**
 * Whole-pixel rectangles, and trimming a layer to the part the frame shows.
 * Pure.
 * @module api/render/visible
 */

/** @typedef {import('./placement.js').Rect} Rect */

/**
 * Whole-pixel version of a rectangle, rounding its edges (not its size) so
 * neighbouring layers never leave a gap.
 * @param {Rect} rect
 * @returns {Rect}
 */
export function pixelRect(rect) {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return {
    ...{ x, y },
    w: Math.max(1, Math.round(rect.x + rect.w) - x),
    h: Math.max(1, Math.round(rect.y + rect.h) - y),
  };
}

/**
 * Trim an unrotated, unanimated layer to the part the frame shows, in whole
 * source pixels. Edges cut by the frame grow outwards (the frame stays
 * covered); real crop edges round to the nearest pixel. Saves scaling pixels
 * nobody sees — a 16:9 clip covering a 9:16 frame is mostly hidden.
 * @param {Rect} crop - Source rectangle
 * @param {Rect} rect - Destination rectangle
 * @param {{ width: number, height: number }} source
 * @param {{ width: number, height: number }} out
 * @returns {{ crop: Rect, rect: Rect } | null} null when nothing is visible
 */
export function visiblePart(crop, rect, source, out) {
  const axis = (cropStart, cropSize, start, size, sourceSize, outSize) => {
    const lo = Math.max(0, start);
    const hi = Math.min(outSize, start + size);
    if (hi - lo < 0.5) return null;
    const perPixel = cropSize / size;
    const from = cropStart + (lo - start) * perPixel;
    const to = cropStart + (hi - start) * perPixel;
    const begin = start < 0 ? Math.floor(from + 1e-6) : Math.round(from);
    const a = Math.min(sourceSize - 1, Math.max(0, begin));
    const b = Math.min(sourceSize, start + size > outSize ? Math.ceil(to - 1e-6) : Math.round(to));
    const length = Math.max(1, b - a);
    return { a, length, at: start + (a - cropStart) / perPixel, span: length / perPixel };
  };
  const h = axis(crop.x, crop.w, rect.x, rect.w, source.width, out.width);
  const v = axis(crop.y, crop.h, rect.y, rect.h, source.height, out.height);
  if (!h || !v) return null;
  return {
    crop: { x: h.a, y: v.a, w: h.length, h: v.length },
    rect: pixelRect({ x: h.at, y: v.at, w: h.span, h: v.span }),
  };
}
