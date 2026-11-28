/**
 * Every change the music editor makes to a clip's song, through the edit
 * session (`updateSong`), so undo works and autosave keeps it. Dragging a
 * slider, painting steps or moving notes changes the song many times;
 * those changes are one interaction and so one undo step (the same gesture
 * the inspector uses). A clip that was called after its song follows it:
 * its label is the song's label until somebody gives it another.
 * @module utils/musicUi/edits
 */

import { updateClip } from '#utils/edl/clipEdit.js';
import { updateSong } from '#utils/edl/musicClip.js';
import { findClip } from '#utils/edl/query.js';
import { getView } from '#utils/editor/view.js';
import { cancelEdit, commitEdit, liveEdit } from '#utils/inspector/gesture.js';
import { songLabel } from '#utils/music/label.js';
import { changePart } from './songEdit.js';

/** @typedef {import('#utils/music/types.js').Song} Song */
/** @typedef {'live'|'commit'|'cancel'} Phase */

/**
 * `updateSong`, and the clip's label with it while that is the song's own.
 * @param {any} doc
 * @param {string} clipId
 * @param {(song: Song) => Song} to
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {any} The same document when the song says what it said
 */
export function retitledSong(doc, clipId, to, opts) {
  const before = findClip(doc, clipId)?.clip;
  const next = updateSong(doc, clipId, to, opts);
  const after = next === doc ? null : findClip(next, clipId)?.clip;
  if (!after || before.label !== songLabel(before.music.song)) return next;
  const label = songLabel(after.music.song);
  return label === after.label ? next : updateClip(next, clipId, { label });
}

/**
 * Change a clip's song.
 * @param {string} clipId
 * @param {string} key - Names what is being edited; live changes with one
 *   key are one undo step
 * @param {(song: Song) => Song} to - From the song the interaction started with
 * @param {Phase} [phase='commit']
 * @param {Element|null} [element] - The control, so presses inside it keep the step open
 * @returns {boolean} true when the document changed (always false while live)
 */
export function changeSong(clipId, key, to, phase = 'commit', element = null) {
  if (phase === 'cancel') {
    cancelEdit();
    return false;
  }
  const { autoCrossfade } = getView();
  /** @type {(doc: any) => any} */
  const operation = (doc) => retitledSong(doc, clipId, to, { autoCrossfade });
  const name = `music:${clipId}:${key}`;
  if (phase === 'live') {
    liveEdit(name, operation, element);
    return false;
  }
  return commitEdit(name, operation);
}

/**
 * Change one part of a clip's song.
 * @param {string} clipId
 * @param {string} partId
 * @param {string} key
 * @param {(part: any, song: Song) => any} to
 * @param {Phase} [phase]
 * @param {Element|null} [element]
 * @returns {boolean}
 */
export function changeSongPart(clipId, partId, key, to, phase, element) {
  /** @type {(song: Song) => Song} */
  const change = (song) => changePart(song, partId, (part) => to(part, song));
  return changeSong(clipId, `${partId}.${key}`, change, phase, element);
}
