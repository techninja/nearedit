/**
 * Pointer events with fingers in mind: one pointer is a press (see
 * `pointer.js`), two fingers are a pinch-zoom that cancels whatever the
 * first finger had started, and a finger that rests opens the context
 * menu (long-press).
 * @module utils/timeline/interaction/touch
 */

import { openContextMenu } from './contextMenu.js';
import { canvasPoint, endPress, movePress, startPress } from './pointer.js';
import { movePinch, startPinch } from './zoomInput.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/** How long a finger must rest before the context menu opens. */
const LONG_PRESS_MS = 550;

/**
 * @typedef {Object} TouchState
 * @property {Map<number, { x: number, y: number }>} fingers - Fingers on the canvas
 * @property {import('./zoomInput.js').Pinch|null} pinch
 * @property {number} timer - Long-press timer
 */

/** @type {WeakMap<Stage, TouchState>} */
const states = new WeakMap();

/**
 * @param {Stage} stage
 * @returns {TouchState}
 */
function stateOf(stage) {
  if (!states.has(stage)) states.set(stage, { fingers: new Map(), pinch: null, timer: 0 });
  return states.get(stage);
}

/**
 * @param {Stage} stage
 * @param {PointerEvent} event
 */
export function pointerDown(stage, event) {
  const state = stateOf(stage);
  clearTimeout(state.timer);
  if (event.pointerType === 'touch') {
    state.fingers.set(event.pointerId, canvasPoint(stage, event));
    if (state.fingers.size === 2) {
      endPress(stage, null);
      const [a, b] = [...state.fingers.values()];
      state.pinch = startPinch(a, b);
      return;
    }
  }
  const press = startPress(stage, event);
  if (!press || event.pointerType !== 'touch') return;
  state.timer = window.setTimeout(() => {
    if (stage.press !== press || press.dragging) return;
    press.data.selectionBefore = null; // the menu is for the clip under the finger: keep it selected
    endPress(stage, null);
    openContextMenu(stage, event, true);
  }, LONG_PRESS_MS);
}

/**
 * @param {Stage} stage
 * @param {PointerEvent} event
 * @returns {boolean} false when no press or pinch took the move (the pointer hovers)
 */
export function pointerMove(stage, event) {
  const state = stateOf(stage);
  if (state.fingers.has(event.pointerId)) {
    state.fingers.set(event.pointerId, canvasPoint(stage, event));
  }
  if (state.pinch) {
    const [a, b] = [...state.fingers.values()];
    if (b) movePinch(state.pinch, a, b);
    return true;
  }
  if (!stage.press) return false;
  movePress(stage, event);
  return true;
}

/**
 * @param {Stage} stage
 * @param {PointerEvent} event
 * @param {boolean} cancelled - The browser took the pointer away
 */
export function pointerEnd(stage, event, cancelled) {
  const state = stateOf(stage);
  clearTimeout(state.timer);
  state.fingers.delete(event.pointerId);
  if (state.pinch) {
    // The pinch lasts until every finger is up; the last one does not start a drag.
    if (state.fingers.size === 0) state.pinch = null;
    return;
  }
  if (stage.press?.pointerId === event.pointerId) endPress(stage, cancelled ? null : event);
}
