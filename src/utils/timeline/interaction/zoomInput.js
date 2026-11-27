/**
 * Wheel and pinch: scrolling, and zooming about the pointer (Ctrl/Cmd +
 * wheel, a trackpad pinch) or about the middle of two fingers.
 * @module utils/timeline/interaction/zoomInput
 */

import { getView, setZoom } from '#utils/editor/view.js';
import { currentViewport, scrollBy, scrollExtent } from '#utils/timeline/scroll.js';
import { wheelZoomFactor, xToTime } from '#utils/timeline/viewport.js';
import { canvasPoint } from './pointer.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */
/** @typedef {{ x: number, y: number }} Point */

/**
 * @typedef {Object} Pinch
 * @property {number} distance - Finger spread when the pinch began
 * @property {number} zoom - Zoom when the pinch began
 * @property {number} anchorTime - Timeline time between the fingers
 */

/**
 * Wheel: Ctrl/Cmd zooms about the pointer (browsers report a trackpad
 * pinch the same way); otherwise scroll — sideways movement scrolls time,
 * vertical movement scrolls the tracks when they overflow and time when
 * they do not; Shift always scrolls time.
 * @param {Stage} stage
 * @param {WheelEvent} event
 */
export function onWheel(stage, event) {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.canvas.clientHeight : 1;
  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  if (event.ctrlKey || event.metaKey) {
    const zoom = getView().zoom * wheelZoomFactor(dy);
    setZoom(zoom, { anchorX: canvasPoint(stage, event).x });
    return;
  }
  const extent = scrollExtent();
  const tracksOverflow = extent.height > extent.viewHeight;
  if (event.shiftKey || !tracksOverflow) scrollBy(dx + dy, 0);
  else scrollBy(dx, dy);
}

/**
 * Two fingers went down: remember the spread and what is between them.
 * @param {Point} a
 * @param {Point} b
 * @returns {Pinch}
 */
export function startPinch(a, b) {
  return {
    distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
    zoom: getView().zoom,
    anchorTime: xToTime(currentViewport(), (a.x + b.x) / 2),
  };
}

/**
 * The fingers moved: zoom by how the spread changed, keeping the time that
 * was between them under their midpoint (so two fingers also pan).
 * @param {Pinch} pinch
 * @param {Point} a
 * @param {Point} b
 */
export function movePinch(pinch, a, b) {
  const spread = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
  setZoom((pinch.zoom * spread) / pinch.distance, {
    anchorTime: pinch.anchorTime,
    anchorX: (a.x + b.x) / 2,
  });
}
