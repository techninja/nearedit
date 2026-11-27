/**
 * Wheel and pinch: scrolling, zooming about the pointer or about the
 * middle of two fingers, and moving the cursor with the wheel.
 * @module utils/timeline/interaction/zoomInput
 */

import { getUserPrefs } from '#store/UserPrefs.js';
import { getDoc } from '#utils/editor/session.js';
import { getView, setZoom } from '#utils/editor/view.js';
import { getPosition, seek } from '#utils/playback/transport.js';
import { currentViewport, scrollBy, scrollExtent } from '#utils/timeline/scroll.js';
import { xToTime } from '#utils/timeline/viewport.js';
import { wheelAction } from '#utils/timeline/wheel.js';
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
 * Wheel: scroll, zoom about the pointer or move the cursor, according to
 * the wheel mode the user chose (`#utils/timeline/wheel.js`).
 * @param {Stage} stage
 * @param {WheelEvent} event
 */
export function onWheel(stage, event) {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.canvas.clientHeight : 1;
  const extent = scrollExtent();
  const { ctrlKey, metaKey, shiftKey } = event;
  const input = {
    dx: event.deltaX * unit,
    dy: event.deltaY * unit,
    ...{ ctrlKey, metaKey, shiftKey },
    tracksOverflow: extent.height > extent.viewHeight,
  };
  const action = wheelAction(input, getUserPrefs().wheelMode);
  if (action.kind === 'scroll') return scrollBy(action.dx, action.dy);
  if (action.kind === 'zoom') {
    setZoom(getView().zoom * action.factor, { anchorX: canvasPoint(stage, event).x });
    if (action.dx) scrollBy(action.dx, 0);
    return undefined;
  }
  // The cursor moves at least a frame for every wheel event.
  const { pps } = currentViewport();
  const frame = 1 / (getDoc().fps || 30);
  const by = Math.sign(action.pixels) * Math.max(frame, Math.abs(action.pixels) / pps);
  return seek(getPosition() + by);
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
