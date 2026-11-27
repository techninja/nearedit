/**
 * Layer placement for the renderer. Positions come from the shared EDL
 * geometry (`resolveTransform`, `placeSource`) so the render matches the
 * preview; this module only scales them to the render size, adds the
 * bounding box of a rotated layer and trims what the frame hides. Pure.
 * @module api/render/placement
 */

import { resolveTransform, placeSource } from '#utils/edl/geometry.js';

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {Object} LayerGeometry
 * @property {Rect[]} crop - Source rectangle at the clip's start and end (source pixels)
 * @property {Rect[]} rect - Unrotated destination at start and end (render pixels)
 * @property {number} rotation - Degrees clockwise, 0 when not rotated
 * @property {number} anchorX
 * @property {number} anchorY
 * @property {number} opacity - 0..1
 * @property {boolean} flipX
 * @property {boolean} flipY
 * @property {boolean} moves - Destination differs between start and end
 * @property {boolean} cropMoves - Source rectangle differs between start and end
 */

const differs = (a, b) => ['x', 'y', 'w', 'h'].some((k) => Math.abs(a[k] - b[k]) > 1e-6);

/**
 * Assemble a LayerGeometry from the transform at the clip's start and the
 * rectangles at both ends.
 * @param {import('#utils/edl/geometry.js').FlatTransform} first
 * @param {Rect[]} crop
 * @param {Rect[]} rect
 * @returns {LayerGeometry}
 */
export function layerGeometry(first, crop, rect) {
  const turn = ((((first.rotation || 0) % 360) + 540) % 360) - 180;
  return {
    ...{ crop, rect },
    rotation: Math.abs(turn) < 0.01 ? 0 : turn,
    anchorX: first.anchorX,
    anchorY: first.anchorY,
    opacity: Math.max(0, Math.min(1, first.opacity)),
    flipX: first.scaleX < 0,
    flipY: first.scaleY < 0,
    moves: differs(rect[0], rect[1]),
    cropMoves: differs(crop[0], crop[1]),
  };
}

/**
 * Where a clip's source lands at its start and at its end.
 * @param {{ transform?: any }} clip
 * @param {{ width: number, height: number }} source - Displayed source size
 * @param {{ width: number, height: number }} frame - EDL resolution
 * @param {{ width: number, height: number }} out - Rendered frame size
 * @returns {LayerGeometry}
 */
export function clipGeometry(clip, source, frame, out) {
  const kx = out.width / frame.width;
  const ky = out.height / frame.height;
  const first = resolveTransform(clip, 0);
  const ends = [first, resolveTransform(clip, 1)].map((t) => {
    const flat = { ...t, scaleX: Math.abs(t.scaleX), scaleY: Math.abs(t.scaleY) };
    const p = placeSource(source.width, source.height, frame.width, frame.height, flat);
    return {
      crop: { x: p.sx, y: p.sy, w: p.sw, h: p.sh },
      rect: { x: p.dx * kx, y: p.dy * ky, w: p.dw * kx, h: p.dh * ky },
    };
  });
  return layerGeometry(
    first,
    ends.map((e) => e.crop),
    ends.map((e) => e.rect),
  );
}

/**
 * Bounding box of a rectangle rotated clockwise about its anchor point.
 * @param {Rect} rect
 * @param {number} degrees
 * @param {number} anchorX - 0..1 within the rectangle
 * @param {number} anchorY
 * @returns {Rect}
 */
export function rotatedBox(rect, degrees, anchorX, anchorY) {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const w = Math.abs(rect.w * cos) + Math.abs(rect.h * sin);
  const h = Math.abs(rect.w * sin) + Math.abs(rect.h * cos);
  const ax = rect.x + anchorX * rect.w;
  const ay = rect.y + anchorY * rect.h;
  const vx = rect.x + rect.w / 2 - ax;
  const vy = rect.y + rect.h / 2 - ay;
  const cx = ax + vx * cos - vy * sin;
  const cy = ay + vx * sin + vy * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

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
