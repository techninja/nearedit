/**
 * Commands on the focused track — the one whose header or lane was last
 * clicked (`activeTrackId`): Vegas's Z and X — and on the height of all
 * tracks.
 * @module utils/commands/tracks
 */

import { getUserPrefs } from '#store/UserPrefs.js';
import { getDoc } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { resizeLanes, toggleLanesMinimized } from '#utils/timeline/laneSize.js';
import { toggleTrackFlag } from '#utils/timeline/trackActions.js';

/** @returns {any|undefined} The focused track, when it still exists */
export function focusedTrack() {
  const id = getView().activeTrackId;
  return getDoc().tracks.find((track) => track.trackId === id);
}

/** @returns {boolean} */
export const hasFocusedTrack = () => !!focusedTrack();

/**
 * Flip mute (hide, for a video track) or solo on the focused track.
 * @param {'muted'|'solo'} flag
 * @returns {boolean} false when no track is focused
 */
export function toggleFocusedTrack(flag) {
  const track = focusedTrack();
  return !!track && toggleTrackFlag(track.trackId, flag);
}

/**
 * @param {'muted'|'solo'} flag
 * @returns {boolean} Whether the focused track has the flag set
 */
export const focusedTrackHas = (flag) => !!focusedTrack()?.[flag];

/** @returns {boolean} false when the tracks cannot get any taller */
export const tracksTaller = () => resizeLanes(1);

/** @returns {boolean} false when the tracks cannot get any shorter */
export const tracksShorter = () => resizeLanes(-1);

/** Minimise every track, or restore the height they had. */
export const minimizeTracks = () => toggleLanesMinimized();

/** @returns {boolean} */
export const tracksAreMinimized = () => getUserPrefs().tracksMinimized;
