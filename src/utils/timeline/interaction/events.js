/**
 * Entry point for every DOM event on the timeline canvas: pointer events
 * go to the press / pinch handling, the rest — hover, wheel, double-click,
 * context menu, drag-and-drop — is routed from here.
 * @module utils/timeline/interaction/events
 */

import { selectRegion } from '#utils/commands/marks.js';
import { selectBetweenMarkers } from '#utils/commands/timeSelection.js';
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
  const { altKey, shiftKey, ctrlKey, clientX, clientY } = event;
  stage.hover = { clientX, clientY };
  const input = { altKey, shiftKey, ctrlKey, panKey: isPanKeyHeld() };
  stage.canvas.style.cursor = cursorFor(hit, input);
  const clipId = hit.locked ? '' : hit.clipId || '';
  if (clipId === stage.overlay.hoverClipId) return;
  stage.overlay.hoverClipId = clipId;
  stage.invalidate();
}

/**
 * Double-click: rename a marker; a region, a clip, or the stretch of ruler
 * between two markers becomes the time selection.
 * @param {Stage} stage
 * @param {MouseEvent} event
 */
function doubleClick(stage, event) {
  const { x, y } = canvasPoint(stage, event);
  const hit = hitTest(stage.geometry(), x, y);
  if (hit.markerId) stage.ui.renameMarker(hit.markerId);
  else if (hit.regionId) selectRegion(hit.regionId);
  else if (hit.zone === 'ruler') selectBetweenMarkers(hit.time);
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
      stage.hover = null;
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
 * Keys the pointer cares about. Escape cancels the drag in progress —
 * heard ahead of the shortcut handler, so the same key does not also clear
 * the selection. Ctrl and Alt going down or up change what a drag from
 * under the resting pointer would do, so the cursor is brought up to date.
 * @param {() => Stage|undefined} getStage - The stage may not exist yet
 * @returns {() => void} Stop listening
 */
export function watchEscape(getStage) {
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    const stage = getStage();
    if (!stage) return;
    const modifier = event.key === 'Control' || event.key === 'Alt';
    if (modifier && stage.hover && !stage.press) {
      const { altKey, shiftKey, ctrlKey } = event;
      hover(stage, /** @type {any} */ ({ ...stage.hover, altKey, shiftKey, ctrlKey }));
    }
    if (event.type !== 'keydown' || event.key !== 'Escape' || !stage.press?.dragging) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    endPress(stage, null);
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
  };
}
