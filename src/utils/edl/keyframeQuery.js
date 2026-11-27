/**
 * Reading keyframes: which properties of a clip are animated, where its
 * keys sit on the timeline (for drawing them on the clip), and stepping
 * from key to key. Read-only, isomorphic and pure.
 * @module utils/edl/keyframeQuery
 */

import { SAME_T } from './keyList.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * One key as the timeline sees it.
 * @typedef {Object} KeyframeEntry
 * @property {string} path - The animated property
 * @property {number} index - Position in `clip.keyframes[path]`
 * @property {number} time - Timeline seconds
 * @property {number} t - Clip-local source seconds, as stored
 * @property {number|string} v
 * @property {string} ease
 * @property {boolean} inside - The key lies within the clip's span; a key
 *   outside it (trimmed away) still shapes the values inside
 */

/**
 * @typedef {Object} KeyframeFilter
 * @property {string} [path] - Only this property
 * @property {boolean} [within=true] - Only keys inside the clip's span
 */

/**
 * The keys of one property.
 * @param {any} clip
 * @param {string} path
 * @returns {import('./types.js').Keyframe[]} Empty when it is not animated
 */
export function keysOf(clip, path) {
  const map = clip?.keyframes;
  return map && Object.hasOwn(map, path) && Array.isArray(map[path]) ? map[path] : [];
}

/**
 * @param {any} clip
 * @param {string} path
 * @returns {boolean} True when the property has keys
 */
export function isAnimated(clip, path) {
  return keysOf(clip, path).length > 0;
}

/**
 * @param {any} clip
 * @returns {string[]} The animated property paths of a clip
 */
export function animatedPaths(clip) {
  return Object.keys(clip?.keyframes || {});
}

/**
 * Timeline time of a key of this clip.
 * @param {{ sourceIn?: number, timelineStart: number }} clip
 * @param {number} t - Clip-local source seconds
 * @returns {number}
 */
export function keyTime(clip, t) {
  return clip.timelineStart + (t - (clip.sourceIn || 0));
}

/**
 * Every key of a clip, in timeline order.
 * @param {any} clip
 * @param {string} [path] - Only this property
 * @returns {KeyframeEntry[]}
 */
export function listKeyframes(clip, path) {
  /** @type {KeyframeEntry[]} */
  const out = [];
  for (const name of path === undefined ? animatedPaths(clip) : [path]) {
    keysOf(clip, name).forEach((key, index) => {
      const time = keyTime(clip, key.t);
      const inside = time >= clip.timelineStart - EPS && time <= clip.timelineEnd + EPS;
      out.push({ path: name, index, time, t: key.t, v: key.v, ease: key.ease, inside });
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * The distinct timeline times at which a clip (or several) has keys —
 * one marker each on the timeline.
 * @param {any|any[]} clips - A clip or a list of clips
 * @param {KeyframeFilter} [filter]
 * @returns {number[]} Ascending
 */
export function keyframeTimes(clips, filter = {}) {
  const within = filter.within !== false;
  const times = [clips]
    .flat()
    .flatMap((clip) => listKeyframes(clip, filter.path))
    .filter((entry) => entry.inside || !within)
    .map((entry) => entry.time)
    .sort((a, b) => a - b);
  return times.filter((time, i) => !i || time - times[i - 1] > SAME_T);
}

/**
 * The first key time after `time` — "go to next keyframe".
 * @param {any|any[]} clips - A clip or a list of clips (e.g. the selection)
 * @param {number} time - Timeline seconds
 * @param {KeyframeFilter} [filter]
 * @returns {number|null} null when there is no later key
 */
export function nextKeyframeTime(clips, time, filter) {
  return keyframeTimes(clips, filter).find((at) => at > time + EPS) ?? null;
}

/**
 * The last key time before `time` — "go to previous keyframe".
 * @param {any|any[]} clips - A clip or a list of clips (e.g. the selection)
 * @param {number} time - Timeline seconds
 * @param {KeyframeFilter} [filter]
 * @returns {number|null} null when there is no earlier key
 */
export function previousKeyframeTime(clips, time, filter) {
  const earlier = keyframeTimes(clips, filter).filter((at) => at < time - EPS);
  return earlier.length ? earlier[earlier.length - 1] : null;
}
