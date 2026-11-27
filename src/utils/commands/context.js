/**
 * What every editor command works with: the edit time, the editing modes
 * and a helper that applies an operation and selects what it created.
 * @module utils/commands/context
 */

import { newClipIds } from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { getPosition, isPlaying } from '#utils/playback/transport.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * The time commands act at: the edit cursor, or the playhead while playing
 * (so that M drops markers on the beat and S cuts where you hear it).
 * @returns {number} Seconds
 */
export function editTime() {
  return isPlaying() ? getPosition() : getView().cursorPosition;
}

/**
 * The editing modes as the pure operations expect them.
 * @returns {{ snapping: boolean, ripple: boolean, autoCrossfade: boolean }}
 */
export function editModes() {
  const { snapping, ripple, autoCrossfade } = getView();
  return { snapping, ripple, autoCrossfade };
}

/**
 * Apply an operation as one undo step and select the clips it created.
 * @param {(doc: Edl) => Edl} operation
 * @returns {boolean} false when nothing changed
 */
export function editAndSelectNew(operation) {
  const before = getDoc();
  if (!edit(operation)) return false;
  const created = newClipIds(before, getDoc());
  if (created.length) setSelection(created, { expand: false });
  return true;
}

/**
 * The track that paste and insert aim at: the active track when it still
 * exists, otherwise none (the operation picks its default).
 * @param {'video'|'audio'} [type] - Only accept a track of this type
 * @returns {string|undefined} trackId
 */
export function targetTrack(type) {
  const id = getView().activeTrackId;
  const track = getDoc().tracks.find((candidate) => candidate.trackId === id);
  if (!track || (type && track.type !== type)) return undefined;
  return track.trackId;
}
