/**
 * Snapping in the preview: while a box is dragged its centre and its edges
 * snap to the centre lines and the edges of the frame; each snap shows a
 * guide line. Also the title-safe and action-safe areas. Output pixels.
 * Pure and isomorphic.
 * @module utils/preview/snap
 */

/** @typedef {{ left: number, right: number, top: number, bottom: number }} Bounds */
/** @typedef {{ axis: 'x'|'y', at: number }} Guide - `x`: a vertical line at that x */

/** Distance on screen, CSS pixels, within which a snap takes hold. */
export const SNAP_PIXELS = 8;

/** Safe areas as fractions of the frame (the usual broadcast margins). */
export const SAFE_AREAS = [
  { id: 'action', label: 'Action safe', inset: 0.05 },
  { id: 'title', label: 'Title safe', inset: 0.1 },
];

/**
 * The smallest correction that lines one of `points` up with one of `lines`.
 * @param {number[]} points - Positions of the box on one axis
 * @param {number[]} lines - Positions it may snap to
 * @param {number} reach
 * @returns {{ shift: number, at: number }|null}
 */
function nearest(points, lines, reach) {
  /** @type {{ shift: number, at: number }|null} */
  let best = null;
  for (const point of points) {
    for (const at of lines) {
      const shift = at - point;
      if (Math.abs(shift) <= reach && (!best || Math.abs(shift) < Math.abs(best.shift))) {
        best = { shift, at };
      }
    }
  }
  return best;
}

/**
 * Snap a moved box to the frame.
 * @param {Bounds} bounds - Where the box would be without snapping (the
 *   axis-aligned rectangle around it)
 * @param {{ width: number, height: number }} frame - Output resolution
 * @param {number} reach - Snap distance in output pixels
 *   (`SNAP_PIXELS / previewScale`)
 * @returns {{ dx: number, dy: number, guides: Guide[] }} The correction to
 *   add to the move, and the lines to show
 */
export function snapMove(bounds, frame, reach) {
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  // The centre is listed first: when a box as wide as the frame is centred,
  // the guide shown is the centre line.
  const x = nearest([cx, bounds.left, bounds.right], [frame.width / 2, 0, frame.width], reach);
  const y = nearest([cy, bounds.top, bounds.bottom], [frame.height / 2, 0, frame.height], reach);
  /** @type {Guide[]} */
  const guides = [];
  if (x) guides.push({ axis: 'x', at: x.at });
  if (y) guides.push({ axis: 'y', at: y.at });
  return { dx: x ? x.shift : 0, dy: y ? y.shift : 0, guides };
}

/**
 * Bounds moved by an offset.
 * @param {Bounds} bounds
 * @param {number} dx
 * @param {number} dy
 * @returns {Bounds}
 */
export function shiftBounds(bounds, dx, dy) {
  return {
    left: bounds.left + dx,
    right: bounds.right + dx,
    top: bounds.top + dy,
    bottom: bounds.bottom + dy,
  };
}
