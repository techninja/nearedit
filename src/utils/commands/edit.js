/**
 * Clip editing commands: split, delete, ripple delete, nudge and trimming
 * the selection to the cursor. Each is one undo step.
 * @module utils/commands/edit
 */

import {
  EPS,
  deleteClips,
  rippleDelete,
  snapToFrame,
  splitClips,
  trimClipEnd,
  trimClipStart,
} from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { movePreview } from '#utils/timeline/reduce/move.js';
import { clipsAtTime } from '#utils/timeline/visible.js';
import { editModes, editTime } from './context.js';

/**
 * The clips a split at `time` would cut: the selected clips under that
 * time, or — when none of them is — every clip under it on an unlocked
 * track.
 * @param {number} time
 * @returns {string[]}
 */
function splitTargets(time) {
  const doc = getDoc();
  const at = snapToFrame(time, doc.fps || 30);
  const under = doc.tracks
    .filter((track) => !track.locked)
    .flatMap((track) => clipsAtTime(track.clips, at))
    .filter(({ clip }) => at - clip.timelineStart > EPS && clip.timelineEnd - at > EPS)
    .map(({ clip }) => clip.clipId);
  const selected = new Set(getSelection());
  const chosen = under.filter((id) => selected.has(id));
  return chosen.length ? chosen : under;
}

/** @returns {boolean} True when there is something to split at the cursor */
export const canSplit = () => splitTargets(editTime()).length > 0;

/**
 * Split at the cursor: the selected clips under it, or — when no selected
 * clip is under the cursor — every clip under it on an unlocked track.
 * @returns {boolean} false when nothing was cut
 */
export function splitAtCursor() {
  const time = editTime();
  const clipIds = splitTargets(time);
  return clipIds.length > 0 && edit((doc) => splitClips(doc, time, { clipIds }));
}

/**
 * Delete the selected clips, leaving a gap — or closing it when ripple
 * mode is on.
 * @returns {boolean}
 */
export function deleteSelection() {
  const ids = getSelection();
  if (!ids.length) return false;
  const { ripple, autoCrossfade } = editModes();
  return edit((doc) =>
    ripple ? rippleDelete(doc, ids, { autoCrossfade }) : deleteClips(doc, ids),
  );
}

/**
 * Delete the selected clips and close the gap on their tracks.
 * @returns {boolean}
 */
export function rippleDeleteSelection() {
  const ids = getSelection();
  if (!ids.length) return false;
  return edit((doc) => rippleDelete(doc, ids, { autoCrossfade: editModes().autoCrossfade }));
}

/**
 * Move the selection by a number of frames (negative = earlier). Follows
 * ripple and auto-crossfade like a drag does; never snaps.
 * @param {number} frames
 * @returns {boolean}
 */
export function nudgeSelection(frames) {
  const clipIds = getSelection();
  if (!clipIds.length || !frames) return false;
  const delta = frames / (getDoc().fps || 30);
  const modes = { ...editModes(), snapping: false };
  return edit((doc) => movePreview(doc, { clipIds, anchorId: clipIds[0], delta }, modes).doc);
}

/**
 * Trim one edge of every selected clip to the cursor.
 * @param {'start'|'end'} edge
 * @returns {boolean}
 */
function trimSelection(edge) {
  const ids = getSelection();
  if (!ids.length) return false;
  const time = editTime();
  const { ripple, autoCrossfade } = editModes();
  const opts = { sourceDurations: sourceDurations(), ripple, autoCrossfade };
  const trim = edge === 'start' ? trimClipStart : trimClipEnd;
  // A linked partner is trimmed with its clip; trimming it again is a no-op.
  return edit((doc) => ids.reduce((next, id) => trim(next, id, time, opts), doc));
}

/** @returns {boolean} */
export const trimStartToCursor = () => trimSelection('start');

/** @returns {boolean} */
export const trimEndToCursor = () => trimSelection('end');
