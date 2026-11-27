/**
 * Editing the keys of one clip — the clip-level half of the keyframe
 * operations in keyframes.js and autoKey.js. Times are timeline times; keys
 * are stored in the clip's own source time. New and moved keys land on the
 * frame grid, and "the key at a time" is the nearest one within half a
 * frame. Isomorphic and pure.
 * @module utils/edl/keyEdit
 */

import { clipLocalTime } from './animate.js';
import { writeValue } from './clipPatch.js';
import { describePath, keyValue } from './clipPaths.js';
import { EASINGS } from './easing.js';
import { MAX_KEYS, MAX_PATHS, SAME_T, sortKeys } from './keyList.js';
import { keysOf } from './keyframeQuery.js';
import { EPS, frameDuration, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./types.js').Keyframe} Keyframe */

/** @type {(edl: Edl) => number} Half a frame: how close a time must be to a key to mean it. */
export const keyReach = (edl) => frameDuration(edl) / 2 + EPS;

/**
 * @param {Keyframe[]} keys
 * @param {number} t - Clip-local time
 * @param {number} reach - How far a key may be from `t`
 * @returns {number} Index of the nearest key within reach, or -1
 */
export function keyIndexAt(keys, t, reach) {
  let best = -1;
  keys.forEach((key, i) => {
    const off = Math.abs(key.t - t);
    if (off <= reach && (best < 0 || off < Math.abs(keys[best].t - t))) best = i;
  });
  return best;
}

/**
 * @param {Clip} clip
 * @param {string} path
 * @param {Keyframe[]} keys - The path is removed when the list is empty
 * @returns {Clip}
 */
export function withKeys(clip, path, keys) {
  const keyframes = { ...clip.keyframes };
  if (keys.length) keyframes[path] = keys;
  else delete keyframes[path];
  return { ...clip, keyframes };
}

/**
 * Add a key, or replace the value of the key at that moment.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @param {any} value
 * @param {string} [ease] - Default: keep the replaced key's, else `linear`
 * @returns {Clip} The clip itself when the path or the value is unusable
 */
export function putKey(edl, clip, path, time, value, ease) {
  const info = describePath(clip, path);
  const v = info ? keyValue(info, value) : undefined;
  if (v === undefined || !Number.isFinite(time)) return clip;
  const keys = keysOf(clip, path);
  const t = clipLocalTime(clip, snap(edl, time));
  const at = keyIndexAt(keys, t, keyReach(edl));
  const paths = Object.keys(clip.keyframes).length;
  if (at < 0 && (keys.length >= MAX_KEYS || (!keys.length && paths >= MAX_PATHS))) return clip;
  const shape = EASINGS.includes(ease) ? ease : at >= 0 ? keys[at].ease : 'linear';
  if (at >= 0 && keys[at].v === v && keys[at].ease === shape) return clip;
  const key = { t: at >= 0 ? keys[at].t : t, v, ease: shape };
  const next = at >= 0 ? keys.map((k, i) => (i === at ? key : k)) : sortKeys([...keys, key]);
  return withKeys(clip, path, next);
}

/**
 * Remove the key at a time. Removing a property's last key ends its
 * animation and leaves the property at the value that key had.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {Track} track
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @returns {Clip}
 */
export function dropKey(edl, clip, track, path, time) {
  const keys = keysOf(clip, path);
  const at = keyIndexAt(keys, clipLocalTime(clip, time), keyReach(edl));
  if (at < 0) return clip;
  const rest = keys.filter((_, i) => i !== at);
  const next = withKeys(clip, path, rest);
  return rest.length ? next : writeValue(next, track, path, keys[at].v);
}

/**
 * Move the key at `fromTime` to `toTime`. A key already sitting at the
 * destination is replaced.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {string} path
 * @param {number} fromTime - Timeline seconds
 * @param {number} toTime - Timeline seconds
 * @returns {Clip}
 */
export function shiftKey(edl, clip, path, fromTime, toTime) {
  const keys = keysOf(clip, path);
  const reach = keyReach(edl);
  const at = keyIndexAt(keys, clipLocalTime(clip, fromTime), reach);
  if (at < 0 || !Number.isFinite(toTime)) return clip;
  const t = clipLocalTime(clip, snap(edl, toTime));
  if (Math.abs(t - keys[at].t) <= SAME_T) return clip;
  const others = keys.filter((key, i) => i !== at && Math.abs(key.t - t) > reach);
  return withKeys(clip, path, sortKeys([...others, { ...keys[at], t }]));
}

/**
 * Change the easing of the segment that leaves the key at a time.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @param {string} ease - One of `EASINGS`
 * @returns {Clip}
 */
export function easeKey(edl, clip, path, time, ease) {
  const keys = keysOf(clip, path);
  const at = keyIndexAt(keys, clipLocalTime(clip, time), keyReach(edl));
  if (at < 0 || !EASINGS.includes(ease) || keys[at].ease === ease) return clip;
  const next = keys.map((key, i) => (i === at ? { ...key, ease } : key));
  return withKeys(clip, path, next);
}
