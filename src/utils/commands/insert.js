/**
 * Commands that add things: markers, titles, tracks and media from the bin.
 * @module utils/commands/insert
 */

import {
  addMarker,
  addTrack,
  insertMedia,
  insertTitle,
  removeMarker,
  removeTrack,
} from '#utils/edl/index.js';
import { edit } from '#utils/editor/session.js';
import { setView } from '#utils/editor/view.js';
import { editAndSelectNew, editModes, editTime, targetTrack } from './context.js';

/** Length of a new title, seconds. */
const TITLE_SECONDS = 5;

/**
 * Add a marker at the cursor (at the playhead while playing).
 * @param {string} [label]
 * @returns {boolean}
 */
export function addMarkerAtCursor(label = '') {
  const time = editTime();
  return edit((doc) => addMarker(doc, time, { label }));
}

/**
 * @param {string} markerId
 * @returns {boolean}
 */
export function deleteMarker(markerId) {
  return edit((doc) => removeMarker(doc, markerId));
}

/**
 * Add a title clip at the cursor and select it, ready for the inspector.
 * It goes on the front-most video track, or on a new track above when
 * that spot is taken.
 * @param {string} [text='Title']
 * @returns {boolean}
 */
export function addTitleAtCursor(text = 'Title') {
  const title = { text, time: editTime(), duration: TITLE_SECONDS };
  const { autoCrossfade } = editModes();
  return editAndSelectNew((doc) => insertTitle(doc, { ...title, autoCrossfade }));
}

/**
 * Add an empty track: video on top, audio at the bottom.
 * @param {'video'|'audio'} type
 * @returns {boolean}
 */
export function addTrackOfType(type) {
  return edit((doc) => addTrack(doc, type));
}

/** @returns {boolean} */
export const addVideoTrack = () => addTrackOfType('video');

/** @returns {boolean} */
export const addAudioTrack = () => addTrackOfType('audio');

/**
 * Remove a track and its clips (refused for a locked track and for the
 * last track of its type).
 * @param {string} trackId
 * @returns {boolean}
 */
export function removeTrackById(trackId) {
  return edit((doc) => removeTrack(doc, trackId));
}

/**
 * Put a media item on the timeline and select the new clips. Used by the
 * drop from the bin (with a time and track) and by "add at cursor".
 * @param {import('#utils/media/library.js').MediaItem} item
 * @param {{ time?: number, trackId?: string }} [at] - Defaults: the cursor,
 *   and the active track when it suits the item. Passing `trackId` (even
 *   as undefined) skips the active track: undefined then means the default
 *   track for that kind of media
 * @returns {boolean} false when the item cannot be placed
 */
export function insertMediaItem(item, at = {}) {
  const lane = item?.type === 'audio' ? 'audio' : 'video';
  const { autoCrossfade } = editModes();
  const marks = /** @type {any} */ (item);
  const opts = {
    time: at.time ?? editTime(),
    trackId: 'trackId' in at ? at.trackId : targetTrack(lane),
    ripple: false, // `editAndSelectNew` ripples
    autoCrossfade,
    // A range marked in the bin's quick look travels with the item.
    ...(Number.isFinite(marks?.sourceIn) && { sourceIn: marks.sourceIn }),
    ...(Number.isFinite(marks?.sourceOut) && { sourceOut: marks.sourceOut }),
  };
  const done = editAndSelectNew((doc) => insertMedia(doc, item, opts));
  if (done && opts.trackId) setView({ activeTrackId: opts.trackId });
  return done;
}
