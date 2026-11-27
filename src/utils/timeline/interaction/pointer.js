/**
 * The life of a pointer press on the timeline canvas — mouse, pen or
 * finger: choose the gesture at button down, turn the press into a drag
 * once the pointer has travelled far enough, preview on every move, and
 * commit (or click) on release. Editing drags are one
 * `beginGesture()` … `endGesture()` each, so they undo as a single step.
 * @module utils/timeline/interaction/pointer
 */

import { beginGesture, cancelGesture, endGesture } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { isPanKeyHeld } from '#utils/keyboard/panKey.js';
import { activeCursor, chooseGesture, dragThreshold } from '#utils/timeline/gestureChoice.js';
import { hitTest } from '#utils/timeline/hitTest.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { autoScroll } from './autoScroll.js';
import { unpressClip } from './clicks.js';
import { GESTURES } from './gestures.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */
/** @typedef {import('./press.js').Press} Press */

/**
 * @param {Stage} stage
 * @param {{ clientX: number, clientY: number }} event
 * @returns {{ x: number, y: number }} The event's position on the canvas
 */
export function canvasPoint(stage, event) {
  const rect = stage.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Button down: decide what this press is.
 * @param {Stage} stage
 * @param {PointerEvent} event
 * @returns {Press|null} The press that started, or null when ignored
 */
export function startPress(stage, event) {
  if (stage.press) return null;
  const { x, y } = canvasPoint(stage, event);
  const geo = stage.geometry(stage.coarse || event.pointerType === 'touch');
  const hit = hitTest(geo, x, y);
  const input = {
    button: event.button,
    pointerType: event.pointerType,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    panKey: isPanKeyHeld(),
  };
  const gesture = chooseGesture(hit, input);
  if (gesture === 'none') return null;
  if (event.button === 1) event.preventDefault(); // no middle-click auto-scroll
  try {
    stage.canvas.setPointerCapture(event.pointerId);
  } catch (err) {
    // The pointer is already gone; the drag still works while it stays over the canvas.
    console.warn('[timeline] could not capture the pointer:', err.message);
  }
  /** @type {Press} */
  const press = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    gesture,
    hit,
    input,
    x0: x,
    y0: y,
    x,
    y,
    time0: xToTimeRaw(geo.vp, x),
    scrollY0: getView().scrollY,
    shiftKey: event.shiftKey,
    dragging: false,
    base: null,
    data: {},
  };
  stage.press = press;
  GESTURES[gesture].down?.(stage, press);
  stage.canvas.style.cursor = activeCursor(gesture);
  stage.invalidate();
  return press;
}

/**
 * Pointer moved while pressed.
 * @param {Stage} stage
 * @param {PointerEvent} event
 */
export function movePress(stage, event) {
  const press = stage.press;
  if (!press || event.pointerId !== press.pointerId) return;
  const gesture = GESTURES[press.gesture];
  Object.assign(press, canvasPoint(stage, event), { shiftKey: event.shiftKey });
  if (!press.dragging) {
    const travelled = Math.hypot(press.x - press.x0, press.y - press.y0);
    if (travelled < dragThreshold(press.pointerType)) return;
    press.dragging = true;
    if (gesture.edits) press.base = beginGesture();
    gesture.begin?.(stage, press);
  }
  gesture.drag?.(stage, press);
  if (gesture.autoScroll) autoScroll(stage);
  stage.invalidate();
}

/**
 * Finish the press: commit a drag, or act on a click.
 * @param {Stage} stage
 * @param {PointerEvent|null} event - null cancels (Escape, lost pointer, second finger)
 */
export function endPress(stage, event) {
  const press = stage.press;
  if (!press || (event && event.pointerId !== press.pointerId)) return;
  const gesture = GESTURES[press.gesture];
  if (!event) {
    // Cancelled: undo whatever the press had started.
    if (press.dragging) gesture.cancel?.(stage, press);
    if (press.dragging && gesture.edits) cancelGesture();
    unpressClip(stage, press);
  } else if (press.dragging) {
    Object.assign(press, canvasPoint(stage, event));
    gesture.drag?.(stage, press);
    gesture.end?.(stage, press);
    if (gesture.edits) endGesture();
  } else if (!press.data.consumed) gesture.click?.(stage, press);
  cancelAnimationFrame(press.scrolling || 0);
  stage.press = null;
  Object.assign(stage.overlay, { guide: null, marquee: null });
  stage.canvas.style.cursor = '';
  stage.invalidate();
}
