/**
 * Layer placement for the renderer. Positions come from the shared EDL
 * geometry (`resolveTransform`, `placeSource`) so the render matches the
 * preview; this module only scales them to the render size and adds the
 * bounding box of a rotated layer. Pure.
 * @module api/render/placement
 */

import { resolveTransform, placeSource } from '#utils/edl/geometry.js';

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {Object} LayerGeometry
 * @property {Rect[]} crop - Source rectangle at evenly spaced moments from the
 *   clip's start to its end (source pixels); two entries unless the crop moves
 * @property {Rect[]} rect - Unrotated destination at the same moments (render pixels)
 * @property {number} rotation - Degrees clockwise, 0 when not rotated
 * @property {number} anchorX
 * @property {number} anchorY
 * @property {number} opacity - 0..1
 * @property {boolean} flipX
 * @property {boolean} flipY
 * @property {boolean} moves - The destination changes over the clip
 * @property {boolean} cropMoves - The source rectangle changes over the clip
 * @property {boolean} [cropHeld] - An animated crop was frozen at its start
 *   (it cannot be combined with rotation)
 */

/**
 * Samples taken along a clip whose crop is animated. Pan and zoom move in
 * straight lines, so two ends describe them exactly; a moving crop changes
 * the fit, which bends the path — it is followed piecewise.
 */
export const CROP_STEPS = 32;

const differs = (a, b) => ['x', 'y', 'w', 'h'].some((k) => Math.abs(a[k] - b[k]) > 1e-6);

/**
 * Assemble a LayerGeometry from the transform at the clip's start and the
 * rectangles along the clip.
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
    moves: rect.some((r) => differs(r, rect[0])),
    cropMoves: crop.some((c) => differs(c, crop[0])),
  };
}

/**
 * Where a clip's source lands over the course of the clip.
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
  const at = (progress, crops = {}) => {
    const t = { ...resolveTransform(clip, progress), ...crops };
    const flat = { ...t, scaleX: Math.abs(t.scaleX), scaleY: Math.abs(t.scaleY) };
    const p = placeSource(source.width, source.height, frame.width, frame.height, flat);
    return {
      crop: { x: p.sx, y: p.sy, w: p.sw, h: p.sh },
      rect: { x: p.dx * kx, y: p.dy * ky, w: p.dw * kx, h: p.dh * ky },
    };
  };
  let samples = [at(0), at(1)];
  const cropMoves = differs(samples[0].crop, samples[1].crop);
  // The rotate filter needs frames of one size, a moving crop changes it:
  // for a rotated clip the crop stays as it is at the clip's start.
  const cropHeld = cropMoves && Math.abs(first.rotation % 360) >= 0.01;
  if (cropHeld) {
    const { cropTop, cropBottom, cropLeft, cropRight } = first;
    samples = [0, 1].map((p) => at(p, { cropTop, cropBottom, cropLeft, cropRight }));
  } else if (cropMoves) {
    samples = Array.from({ length: CROP_STEPS + 1 }, (_, i) => at(i / CROP_STEPS));
  }
  const geometry = layerGeometry(
    first,
    samples.map((sample) => sample.crop),
    samples.map((sample) => sample.rect),
  );
  return { ...geometry, cropHeld };
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
