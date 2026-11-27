/**
 * The keyframe state of one inspector field at the playhead: whether the
 * property is animated, whether a key sits under the playhead, and whether
 * there are keys to step to. A field may drive several paths at once
 * (position X and Y, the two halves of a point) on several selected clips;
 * the state is merged across all of them. Pure and isomorphic.
 * @module utils/keyframes/state
 */

import { listKeyframes } from '#utils/edl/keyframeQuery.js';
import { EPS } from '#utils/edl/time.js';

/**
 * @typedef {Object} KeyState
 * @property {'none'|'key'|'between'} state - Not animated / a key under the
 *   playhead / animated, between keys
 * @property {boolean} hasPrevious - A key inside the clip before the playhead
 * @property {boolean} hasNext - A key inside the clip after the playhead
 * @property {number|null} current - Timeline time of the current key: the
 *   one under the playhead, else the last one before it (whose easing
 *   shapes the segment the playhead is in)
 * @property {string} ease - Easing of the current key; '' when there is
 *   none or the keys disagree
 */

/** @type {KeyState} */
export const NOT_ANIMATED = {
  state: 'none',
  hasPrevious: false,
  hasNext: false,
  current: null,
  ease: '',
};

/**
 * How close a time must be to a key to mean it: half a frame.
 * @param {number} fps
 * @returns {number} Seconds
 */
export const keyReach = (fps) => 0.5 / (fps > 0 ? fps : 30) + EPS;

/**
 * @param {any[]} clips - The clips the field applies to
 * @param {string[]} paths - The property paths the field drives
 * @param {number} time - Playhead, timeline seconds
 * @param {number} [fps=30]
 * @returns {KeyState}
 */
export function keyframeState(clips, paths, time, fps = 30) {
  const reach = keyReach(fps);
  const keys = clips.flatMap((clip) => paths.flatMap((path) => listKeyframes(clip, path)));
  if (!keys.length) return NOT_ANIMATED;
  const under = keys.filter((key) => Math.abs(key.time - time) <= reach);
  const before = keys.filter((key) => key.time < time - reach);
  const after = keys.filter((key) => key.time > time + reach);
  const last = before.length ? Math.max(...before.map((key) => key.time)) : null;
  const current = under.length ? under[0].time : last;
  const eases = new Set(
    keys
      .filter((key) => current !== null && Math.abs(key.time - current) <= reach)
      .map((key) => key.ease || 'linear'),
  );
  return {
    state: under.length ? 'key' : 'between',
    hasPrevious: before.some((key) => key.inside),
    hasNext: after.some((key) => key.inside),
    current,
    ease: eases.size === 1 ? [...eases][0] : '',
  };
}

/**
 * The time of the key to step to from the playhead.
 * @param {any[]} clips
 * @param {string[]} paths
 * @param {number} time - Timeline seconds
 * @param {1|-1} direction - 1 = next, -1 = previous
 * @param {number} [fps=30]
 * @returns {number|null} null when there is no key that way inside the clip
 */
export function stepTime(clips, paths, time, direction, fps = 30) {
  const reach = keyReach(fps);
  const times = clips
    .flatMap((clip) => paths.flatMap((path) => listKeyframes(clip, path)))
    .filter((key) => key.inside)
    .map((key) => key.time)
    .filter((at) => (direction > 0 ? at > time + reach : at < time - reach));
  if (!times.length) return null;
  return direction > 0 ? Math.min(...times) : Math.max(...times);
}
