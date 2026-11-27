/**
 * Clip editing commands: split, delete, ripple delete, nudge and trimming
 * the selection to the cursor or to the time selection. Each is one undo
 * step; with auto ripple on, later clips follow the edit.
 * @module utils/commands/edit
 */

import {
  EPS,
  deleteClips,
  snapToFrame,
  splitClips,
  trimClipEnd,
  trimClipStart,
} from '#utils/edl/index.js';
import { trimToRange } from '#utils/edl/selectionEdits.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { getEdgeTrim } from '#utils/timeline/edgeTrim.js';
import { movePreview } from '#utils/timeline/reduce/move.js';
import { clipsAtTime } from '#utils/timeline/visible.js';
import { editModes, editRippling, editTime } from './context.js';
import { trimEdgeBy } from './eventKeys.js';

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
  return ids.length > 0 && editRippling((doc) => deleteClips(doc, ids));
}

/**
 * Delete the selected clips and close the gap, whatever the ripple mode.
 * @returns {boolean}
 */
export function rippleDeleteSelection() {
  const ids = getSelection();
  return ids.length > 0 && editRippling((doc) => deleteClips(doc, ids), true);
}

/**
 * Move the selection in time (negative = earlier) — or, in edge-trim mode,
 * trim the chosen edge by that much. Follows ripple and auto-crossfade
 * like a drag does; never snaps.
 * @param {number} seconds
 * @returns {boolean}
 */
export function nudgeBy(seconds) {
  if (getEdgeTrim()) return trimEdgeBy(seconds);
  const clipIds = getSelection();
  if (!clipIds.length || !seconds) return false;
  const modes = { ...editModes(), snapping: false, ripple: false };
  const drag = { clipIds, anchorId: clipIds[0], delta: seconds };
  return editRippling((doc) => movePreview(doc, drag, modes).doc);
}

/**
 * Nudge by a number of frames.
 * @param {number} frames
 * @returns {boolean}
 */
export const nudgeSelection = (frames) => nudgeBy(frames / (getDoc().fps || 30));

/**
 * Trim one edge of every selected clip to the cursor.
 * @param {'start'|'end'} edge
 * @returns {boolean}
 */
function trimSelection(edge) {
  const ids = getSelection();
  if (!ids.length) return false;
  const time = editTime();
  const opts = { sourceDurations: sourceDurations(), autoCrossfade: editModes().autoCrossfade };
  const trim = edge === 'start' ? trimClipStart : trimClipEnd;
  // A linked partner is trimmed with its clip; trimming it again is a no-op.
  return editRippling((doc) => ids.reduce((next, id) => trim(next, id, time, opts), doc));
}

/** @returns {boolean} */
export const trimStartToCursor = () => trimSelection('start');

/** @returns {boolean} */
export const trimEndToCursor = () => trimSelection('end');

/** @returns {boolean} True when there is a time selection to trim to */
export const canTrimToSelection = () => getView().loopEnd > getView().loopStart;

/**
 * Vegas "Trim": keep only what lies inside the time selection — of the
 * selected clips, or of every clip when none is selected.
 * @returns {boolean}
 */
export function trimToSelection() {
  const { loopStart, loopEnd, autoCrossfade } = getView();
  if (!(loopEnd > loopStart)) return false;
  const chosen = getSelection();
  const opts = { sourceDurations: sourceDurations(), autoCrossfade };
  return editRippling((doc) => {
    const all = doc.tracks.flatMap((track) => track.clips.map((clip) => clip.clipId));
    return trimToRange(doc, chosen.length ? chosen : all, loopStart, loopEnd, opts);
  });
}
