/**
 * What a click (a press released without dragging) does: select a clip,
 * clear the selection on an empty lane, move the edit cursor.
 * @module utils/timeline/interaction/clicks
 */

import { expandSelection, findClip } from '#utils/edl/index.js';
import { getDoc } from '#utils/editor/session.js';
import {
  clearSelection,
  getSelection,
  selectClip,
  setSelection,
  setView,
} from '#utils/editor/view.js';
import { seek, setLoopRange } from '#utils/playback/transport.js';
import { isToggleClick } from '#utils/timeline/gestureChoice.js';
import { snapPoint } from './press.js';

/** @typedef {import('./press.js').Press} Press */
/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * Button down on a clip: select it at once so that a drag carries it and
 * the outline answers the press. A clip that is already selected keeps the
 * whole selection, so several clips can be dragged together.
 * @param {Stage} _stage
 * @param {Press} press
 */
export function pressClip(_stage, press) {
  const { clipId } = press.hit;
  const selection = getSelection();
  const toggle = isToggleClick(press.input);
  if (selection.includes(clipId)) {
    press.data.clipIds = selection;
    return;
  }
  const group = expandSelection(getDoc(), [clipId]);
  press.data.clipIds = toggle ? [...selection, ...group] : group;
  press.data.selectedOnDown = true;
  press.data.selectionBefore = selection;
  selectClip(clipId, { toggle });
}

/**
 * A press was cancelled (Escape, a second finger starting a pinch): put
 * back the selection that pressing the clip had changed.
 * @param {Stage} _stage
 * @param {Press} press
 */
export function unpressClip(_stage, press) {
  if (press.data.selectionBefore) setSelection(press.data.selectionBefore, { expand: false });
}

/**
 * Click on a clip: a plain click makes it the selection and puts the edit
 * cursor where it was clicked (so S splits there); a Ctrl/Cmd/Shift click
 * toggles it in the selection and leaves the cursor alone.
 * @param {Stage} stage
 * @param {Press} press
 */
export function clickClip(stage, press) {
  const { clipId, trackId, time } = press.hit;
  if (isToggleClick(press.input)) {
    if (!press.data.selectedOnDown) selectClip(clipId, { toggle: true });
    return;
  }
  selectClip(clipId);
  setView({ activeTrackId: trackId });
  seek(snapPoint(time, stage.geometry().vp.pps).time);
}

/**
 * Click on an empty part of a lane: clear the selection (unless a toggle
 * modifier is held), make the lane the active track and move the cursor.
 * @param {Stage} stage
 * @param {Press} press
 */
export function clickEmpty(stage, press) {
  if (!isToggleClick(press.input)) clearSelection();
  if (press.hit.trackId) setView({ activeTrackId: press.hit.trackId });
  seek(snapPoint(press.hit.time, stage.geometry().vp.pps, press.shiftKey).time);
}

/**
 * Double-click on a clip: set the loop region to the clip, Vegas-style.
 * @param {string} clipId
 */
export function loopClip(clipId) {
  const clip = findClip(getDoc(), clipId)?.clip;
  if (clip) setLoopRange(clip.timelineStart, clip.timelineEnd);
}
