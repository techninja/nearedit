/**
 * The Vegas "event keys" (Vegas calls a clip an event): choosing an edge to
 * trim from the keyboard, trimming it, and moving the selection to the
 * track above or below.
 * @module utils/commands/eventKeys
 */

import { findClip, moveClips, tracksOfType, trimClipEnd, trimClipStart } from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection, getView, setSelection, setView } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { seek } from '#utils/playback/transport.js';
import { getEdgeTrim, setEdgeTrim, stepEdge } from '#utils/timeline/edgeTrim.js';
import { editRippling } from './context.js';

/**
 * @param {import('#utils/timeline/edgeTrim.js').EdgeTrim} at
 * @returns {number} Where that edge is now; NaN when its clip is gone
 */
function edgeTime(at) {
  const clip = findClip(getDoc(), at.clipId)?.clip;
  return clip ? (at.edge === 'start' ? clip.timelineStart : clip.timelineEnd) : NaN;
}

/**
 * Enter edge-trim mode on the start or end of the selected clip. Pressed
 * again in the mode, the choice walks to the edge before (start) or after
 * (end) along the track. The cursor goes to the chosen edge.
 * @param {'start'|'end'} edge
 * @returns {boolean} false when there is no clip, or no further edge
 */
export function selectEdge(edge) {
  const doc = getDoc();
  const current = getEdgeTrim();
  const clipId = getSelection().find((id) => findClip(doc, id));
  const next = current
    ? stepEdge(doc, current, edge === 'start' ? -1 : 1)
    : clipId && { clipId, edge };
  if (!next) return false;
  setEdgeTrim(next);
  if (!getSelection().includes(next.clipId)) setSelection([next.clipId]);
  seek(edgeTime(next));
  return true;
}

/** @returns {boolean} True when an edge could be chosen or stepped from */
export const canSelectEdge = () => !!getEdgeTrim() || getSelection().length > 0;

/**
 * Leave edge-trim mode.
 * @returns {boolean} false when the mode was not on
 */
export function leaveEdgeTrim() {
  if (!getEdgeTrim()) return false;
  setEdgeTrim(null);
  return true;
}

/**
 * Trim the chosen edge by an amount (negative = earlier). The cursor
 * follows the edge, so the preview shows the frame being cut to.
 * @param {number} seconds
 * @returns {boolean} false when the mode is off or the edge cannot move
 */
export function trimEdgeBy(seconds) {
  const at = getEdgeTrim();
  if (!at || !seconds) return false;
  const to = edgeTime(at) + seconds;
  const trim = at.edge === 'start' ? trimClipStart : trimClipEnd;
  const opts = { sourceDurations: sourceDurations(), autoCrossfade: getView().autoCrossfade };
  const done = editRippling((doc) => trim(doc, at.clipId, to, opts));
  if (done) seek(edgeTime(at));
  return done;
}

/**
 * Move the selected clips to the track above or below, among the tracks
 * of their kind (picture stays on video tracks, sound on audio tracks).
 * @param {1|-1} direction - 1 = down
 * @returns {boolean} false at the top or bottom, or onto a locked track
 */
export function moveSelectionToTrack(direction) {
  const clipIds = getSelection();
  const anchor = findClip(getDoc(), clipIds[0]);
  if (!anchor) return false;
  const lane = tracksOfType(getDoc(), anchor.track.type);
  const target = lane[lane.indexOf(anchor.track) + direction];
  if (!target) return false;
  const { autoCrossfade } = getView();
  const opts = { toTrackId: target.trackId, anchorId: clipIds[0], autoCrossfade };
  const done = edit((doc) => moveClips(doc, clipIds, opts));
  if (done) setView({ activeTrackId: target.trackId });
  return done;
}
