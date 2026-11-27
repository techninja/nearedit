/**
 * From a drag in the preview to the transform values it stands for: the
 * mode (move, scale, rotate), the modifier keys and snapping put together.
 * Pure and isomorphic.
 * @module utils/preview/dragValues
 */

import { framePoint } from './boxQuery.js';
import { dragMove, dragRotate, dragScale } from './drag.js';
import { SNAP_PIXELS, shiftBounds, snapMove } from './snap.js';

/**
 * A drag as the overlay records it at pointer-down.
 * @typedef {Object} PreviewDrag
 * @property {'move'|'scale'|'rotate'} mode
 * @property {import('./drag.js').DragStart} start
 * @property {import('./snap.js').Bounds} bounds - Rectangle around the box at the start
 * @property {{ left: number, top: number, width: number, height: number }} rect -
 *   The preview frame on screen
 * @property {{ width: number, height: number }} out - Output resolution
 * @property {number} scale - Screen pixels per output pixel
 */

/**
 * @param {PreviewDrag} drag
 * @param {{ clientX: number, clientY: number, shiftKey?: boolean, altKey?: boolean }} event -
 *   The pointer now. Shift constrains (one axis / free aspect / 15° stops);
 *   Alt switches snapping off
 * @returns {{ values: Record<string, number>, guides: import('./snap.js').Guide[] }}
 *   `values` by property path
 */
export function dragValues(drag, event) {
  const point = framePoint(event, drag.rect, drag.out);
  if (drag.mode === 'scale') {
    const { scaleX, scaleY } = dragScale(drag.start, point, { free: event.shiftKey });
    return { values: { 'transform.scaleX': scaleX, 'transform.scaleY': scaleY }, guides: [] };
  }
  if (drag.mode === 'rotate') {
    const opts = { stepped: event.shiftKey, snap: !event.altKey };
    return {
      values: { 'transform.rotation': dragRotate(drag.start, point, opts).rotation },
      guides: [],
    };
  }
  const moved = dragMove(drag.start, point, { axis: event.shiftKey });
  const { transform } = drag.start.box;
  const bounds = shiftBounds(drag.bounds, moved.x - transform.x, moved.y - transform.y);
  const snap = event.altKey
    ? { dx: 0, dy: 0, guides: [] }
    : snapMove(bounds, drag.out, SNAP_PIXELS / drag.scale);
  const x = Math.round((moved.x + snap.dx) * 100) / 100;
  const y = Math.round((moved.y + snap.dy) * 100) / 100;
  return { values: { 'transform.x': x, 'transform.y': y }, guides: snap.guides };
}
