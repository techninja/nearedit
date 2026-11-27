/**
 * What every editor command works with: the edit time, the editing modes
 * and a helper that applies an operation and selects what it created.
 * @module utils/commands/context
 */

import { findClip, newClipIds } from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { PX_PER_SECOND, getView, setSelection } from '#utils/editor/view.js';
import { getPosition, isPlaying } from '#utils/playback/transport.js';
import { rippled } from './postRipple.js';

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
 * One screen pixel as time, but never less than a frame: the step of the
 * Vegas "by pixel" keys, which get finer as you zoom in.
 * @returns {number} Seconds
 */
export function pixelSeconds() {
  return Math.max(1 / (getDoc().fps || 30), 1 / (PX_PER_SECOND * getView().zoom));
}

/**
 * Apply an edit as one undo step; with auto ripple on, later clips follow
 * it (see `postRipple.js`).
 * @param {(doc: Edl) => Edl} operation - The edit itself, without any ripple
 * @param {boolean} [always] - Ripple even when auto ripple is off
 * @returns {boolean} false when nothing changed
 */
export function editRippling(operation, always = false) {
  const ripple = always || getView().ripple;
  return edit((doc) => (ripple ? rippled(doc, operation(doc)) : operation(doc)));
}

/**
 * Apply an edit (rippling, as above) and select the clips it created.
 * @param {(doc: Edl) => Edl} operation
 * @returns {boolean} false when nothing changed
 */
export function editAndSelectNew(operation) {
  /** @type {string[]} */
  let created = [];
  const done = editRippling((doc) => {
    const plain = operation(doc);
    created = newClipIds(doc, plain);
    return plain;
  });
  const kept = created.filter((id) => findClip(getDoc(), id));
  if (done && kept.length) setSelection(kept, { expand: false });
  return done;
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
