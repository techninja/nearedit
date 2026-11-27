/**
 * What the track headers do to the document: rename, mute / solo / lock,
 * volume. Each is one undo step; dragging the volume slider previews live
 * and becomes a single step when released.
 * @module utils/timeline/trackActions
 */

import {
  renameTrack,
  setTrackVolume,
  toggleTrackLock,
  toggleTrackMute,
  toggleTrackSolo,
} from '#utils/edl/index.js';
import { beginGesture, commit, edit, endGesture, getDoc } from '#utils/editor/session.js';

const TOGGLES = { muted: toggleTrackMute, solo: toggleTrackSolo, locked: toggleTrackLock };

/**
 * Flip mute (hide, for video), solo or lock.
 * @param {string} trackId
 * @param {'muted'|'solo'|'locked'} flag
 * @returns {boolean}
 */
export function toggleTrackFlag(trackId, flag) {
  return edit((doc) => TOGGLES[flag](doc, trackId));
}

/**
 * Rename a track.
 * @param {string} trackId
 * @param {string} name - Trimmed; an empty name is refused
 * @returns {string} The track's name afterwards (to restore a refused field)
 */
export function renameTrackTo(trackId, name) {
  const wanted = name.trim();
  if (wanted) edit((doc) => renameTrack(doc, trackId, wanted));
  return getDoc().tracks.find((track) => track.trackId === trackId)?.name || '';
}

/**
 * Live volume change while the slider moves; call `commitTrackVolume` when
 * it is released.
 * @param {string} trackId
 * @param {number} volume - Linear gain 0..2
 */
export function previewTrackVolume(trackId, volume) {
  commit(setTrackVolume(beginGesture(), trackId, volume));
}

/** The volume slider was released: record the drag as one undo step. */
export function commitTrackVolume() {
  endGesture();
}
