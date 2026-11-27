/**
 * Height of the track lanes: the default for the pointer (taller for a
 * finger), or what the user set with the track-height keys, or the
 * smallest while the tracks are minimised. Kept in the user's preferences,
 * so it survives a reload.
 * @module utils/timeline/laneSize
 */

import { getUserPrefs, setUserPrefs } from '#store/UserPrefs.js';
import { LANE_H, LANE_H_COARSE } from './layout.js';

export const MIN_LANE_H = 22;
export const MAX_LANE_H = 240;
/** One press of the track-height keys. */
export const LANE_STEP = 12;
/** Below this a header has room for the track's name only. */
export const COMPACT_LANE_H = 52;

/**
 * The lane height for a set of preferences. Pure.
 * @param {{ trackHeight?: number, tracksMinimized?: boolean }} prefs
 * @param {boolean} [coarse] - The primary pointer is a finger
 * @returns {number} Pixels
 */
export function laneHeightFor(prefs, coarse = false) {
  if (prefs.tracksMinimized) return MIN_LANE_H;
  const base = coarse ? LANE_H_COARSE : LANE_H;
  if (!(prefs.trackHeight > 0)) return base;
  return Math.max(MIN_LANE_H, Math.min(MAX_LANE_H, Math.round(prefs.trackHeight)));
}

/** @returns {boolean} */
const isCoarse = () => !!globalThis.matchMedia?.('(pointer: coarse)').matches;

/** @returns {number} The lane height now, pixels */
export const getLaneHeight = () => laneHeightFor(getUserPrefs(), isCoarse());

/**
 * Make every track taller or shorter by one step.
 * @param {1|-1} direction
 * @returns {boolean} false at the limit
 */
export function resizeLanes(direction) {
  const from = getLaneHeight();
  const to = Math.max(MIN_LANE_H, Math.min(MAX_LANE_H, from + direction * LANE_STEP));
  if (to === from) return false;
  setUserPrefs({ trackHeight: to, tracksMinimized: false });
  return true;
}

/** Minimise every track, or bring back the height they had. */
export function toggleLanesMinimized() {
  setUserPrefs({ tracksMinimized: !getUserPrefs().tracksMinimized });
}
