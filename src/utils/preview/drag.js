/**
 * Direct manipulation in the preview: what a drag on a clip's box, on one
 * of its corner handles or on its rotate handle does to the clip's
 * transform. Every function is "state at pointer-down + where the pointer
 * is now → new values", so a drag can be recomputed from its start on each
 * move. All points are output pixels. Pure and isomorphic.
 * @module utils/preview/drag
 */

import { boxCenter, rotatePoint } from './geometry.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./geometry.js').Box} Box */

/**
 * @typedef {Object} DragStart
 * @property {Point} point - Where the pointer went down
 * @property {Box} box - The clip's box at that moment
 */

/** Smallest and largest scale a drag can produce (the inspector's range). */
export const SCALE_RANGE = { min: 0.01, max: 20 };
/** Degrees between the stops of a constrained (Shift) rotation. */
export const ROTATE_STEP = 15;
/** A free rotation this close to a quarter turn lands on it. */
export const ROTATE_SNAP = 3;

/** @type {(value: number, digits: number) => number} */
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Drag the box: the clip's offset follows the pointer.
 * @param {DragStart} start
 * @param {Point} point - Where the pointer is now
 * @param {{ axis?: boolean }} [opts] - `axis`: move along the dominant axis only (Shift)
 * @returns {{ x: number, y: number }} `transform.x` / `transform.y`
 */
export function dragMove(start, point, opts = {}) {
  let dx = point.x - start.point.x;
  let dy = point.y - start.point.y;
  if (opts.axis) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const { x, y } = start.box.transform;
  return { x: round(x + dx, 2), y: round(y + dy, 2) };
}

/**
 * Drag a corner: the box grows or shrinks about its centre so the corner
 * follows the pointer. By default both axes scale together.
 * @param {DragStart} start
 * @param {Point} point
 * @param {{ free?: boolean }} [opts] - `free`: width and height separately (Shift)
 * @returns {{ scaleX: number, scaleY: number }}
 */
export function dragScale(start, point, opts = {}) {
  const { box } = start;
  const centre = boxCenter(box);
  const local = (/** @type {Point} */ p) => {
    const turned = rotatePoint(p, centre, -box.rotation);
    return { x: turned.x - centre.x, y: turned.y - centre.y };
  };
  const from = local(start.point);
  const to = local(point);
  const clamp = (/** @type {number} */ value) =>
    round(Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, value)), 4);
  const { scaleX, scaleY } = box.transform;
  if (opts.free) {
    const fx = Math.abs(from.x) > 1e-6 ? Math.abs(to.x / from.x) : 1;
    const fy = Math.abs(from.y) > 1e-6 ? Math.abs(to.y / from.y) : 1;
    return { scaleX: clamp(scaleX * fx), scaleY: clamp(scaleY * fy) };
  }
  const reach = from.x * from.x + from.y * from.y;
  // Along the line from the centre through the grabbed corner.
  const factor = reach > 1e-9 ? Math.max(0, (to.x * from.x + to.y * from.y) / reach) : 1;
  return { scaleX: clamp(scaleX * factor), scaleY: clamp(scaleY * factor) };
}

/**
 * Drag the rotate handle: the box turns about its pivot by the angle the
 * pointer has swept.
 * @param {DragStart} start
 * @param {Point} point
 * @param {{ stepped?: boolean, snap?: boolean }} [opts] - `stepped`: stops
 *   every 15° (Shift); `snap`: land on quarter turns when close
 * @returns {{ rotation: number }} Degrees clockwise, within ±360
 */
export function dragRotate(start, point, opts = {}) {
  const { pivot } = start.box;
  const angle = (/** @type {Point} */ p) => Math.atan2(p.y - pivot.y, p.x - pivot.x);
  let swept = ((angle(point) - angle(start.point)) * 180) / Math.PI;
  if (swept > 180) swept -= 360;
  if (swept < -180) swept += 360;
  let rotation = start.box.transform.rotation + swept;
  if (opts.stepped) rotation = Math.round(rotation / ROTATE_STEP) * ROTATE_STEP;
  else if (opts.snap) {
    const quarter = Math.round(rotation / 90) * 90;
    if (Math.abs(rotation - quarter) <= ROTATE_SNAP) rotation = quarter;
  }
  if (Math.abs(rotation) > 360) rotation %= 360;
  return { rotation: round(rotation, 1) + 0 };
}
