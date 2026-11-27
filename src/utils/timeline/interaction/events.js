/**
 * Entry point for every DOM event on the timeline canvas: pointer events
 * go to the press / pinch handling, the rest — hover, wheel, double-click,
 * context menu, drag-and-drop — is routed from here.
 * @module utils/timeline/interaction/events
 */

import { isPanKeyHeld } from '#utils/keyboard/panKey.js';
import { cursorFor } from '#utils/timeline/gestureChoice.js';
import { hitTest } from '#utils/timeline/hitTest.js';
import { loopClip } from './clicks.js';
import { openContextMenu } from './contextMenu.js';
import { onDragLeave, onDragOver, onDrop } from './drop.js';
import { canvasPoint, endPress } from './pointer.js';
import { pointerDown, pointerEnd, pointerMove } from './touch.js';
import { onWheel } from './zoomInput.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * The pointer moves with no button down: show the cursor that says what a
 * drag from here would do, and the fade handles of the clip under it.
 * @param {Stage} stage
 * @param {PointerEvent} event
 */
function hover(stage, event) {
  const { x, y } = canvasPoint(stage, event);
  const hit = hitTest(stage.geometry(), x, y);
  const { altKey, shiftKey } = event;
  stage.canvas.style.cursor = cursorFor(hit, { altKey, shiftKey, panKey: isPanKeyHeld() });
  const clipId = hit.locked ? '' : hit.clipId || '';
  if (clipId === stage.overlay.hoverClipId) return;
  stage.overlay.hoverClipId = clipId;
  stage.invalidate();
}

/**
 * Double-click: rename a marker; on a clip, set the loop region to it.
 * @param {Stage} stage
 * @param {MouseEvent} event
 */
function doubleClick(stage, event) {
  const { x, y } = canvasPoint(stage, event);
  const hit = hitTest(stage.geometry(), x, y);
  if (hit.markerId) stage.ui.renameMarker(hit.markerId);
  else if (hit.clipId && !hit.locked) loopClip(hit.clipId);
}

/**
 * Handle a DOM event from the timeline canvas.
 * @param {Stage} stage
 * @param {any} event
 */
export function handleStageEvent(stage, event) {
  switch (event.type) {
    case 'pointerdown':
      return pointerDown(stage, event);
    case 'pointermove':
      if (!pointerMove(stage, event) && event.pointerType !== 'touch') hover(stage, event);
      return undefined;
    case 'pointerup':
      return pointerEnd(stage, event, false);
    case 'pointercancel':
      return pointerEnd(stage, event, true);
    case 'pointerleave':
      stage.overlay.hoverClipId = '';
      return stage.invalidate();
    case 'wheel':
      return onWheel(stage, event);
    case 'dblclick':
      return doubleClick(stage, event);
    case 'contextmenu':
      event.preventDefault();
      if (stage.press) stage.press.data.consumed = true;
      return openContextMenu(stage, event);
    case 'dragover':
      return onDragOver(stage, event);
    case 'dragleave':
      return onDragLeave(stage);
    case 'drop':
      return onDrop(stage, event);
    default:
      return undefined;
  }
}

/**
 * Escape cancels the drag in progress. Listens ahead of the shortcut
 * handler so the same key does not also clear the selection.
 * @param {() => Stage|undefined} getStage - The stage may not exist yet
 * @returns {() => void} Stop listening
 */
export function watchEscape(getStage) {
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    const stage = getStage();
    if (event.key !== 'Escape' || !stage?.press?.dragging) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    endPress(stage, null);
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
