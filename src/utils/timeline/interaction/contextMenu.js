/**
 * Opening the timeline's context menu (right-click, or a long-press with a
 * finger) for what is under a point.
 * @module utils/timeline/interaction/contextMenu
 */

import { getSelection, selectClip, setView } from '#utils/editor/view.js';
import { isPlaying, seek } from '#utils/playback/transport.js';
import { hitTest } from '#utils/timeline/hitTest.js';
import { canvasPoint } from './pointer.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * A long-press opens the menu from a timer, and the browser may follow up
 * with its own `contextmenu` event for the same press: ignore that one.
 */
const LONG_PRESS_ECHO_MS = 1000;

/** @type {WeakMap<Stage, number>} When each stage last opened its menu by long-press */
const longPressAt = new WeakMap();

/**
 * Open the context menu. A clip that is not selected becomes the
 * selection, and the edit cursor moves to the point (unless playing), so
 * "split", "paste" and "add marker" act where you pointed.
 * @param {Stage} stage
 * @param {{ clientX: number, clientY: number }} event
 * @param {boolean} [longPress] - Opened by a resting finger, not a `contextmenu` event
 */
export function openContextMenu(stage, event, longPress = false) {
  const now = performance.now();
  if (longPress) longPressAt.set(stage, now);
  else if (now - (longPressAt.get(stage) ?? -Infinity) < LONG_PRESS_ECHO_MS) return;
  const { x, y } = canvasPoint(stage, event);
  const hit = hitTest(stage.geometry(), x, y);
  if (hit.clipId && !hit.locked && !getSelection().includes(hit.clipId)) selectClip(hit.clipId);
  if (hit.trackId) setView({ activeTrackId: hit.trackId });
  if (!isPlaying() && !hit.markerId) seek(hit.time);
  const { clientX, clientY } = event;
  // Open on the next frame, once the selection and cursor have landed in the store.
  requestAnimationFrame(() => stage.ui.openMenu(clientX, clientY, hit));
}
