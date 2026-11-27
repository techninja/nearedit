/**
 * Keyframe operations on a clip's animated properties. Every time passed
 * in is a **timeline** time; keys are stored in the clip's own source time
 * (`clipLocalTime`), which is what keeps them attached to the content
 * through trims, slips and splits. New and moved keys land on the frame
 * grid, and "the key at a time" is the nearest one within half a frame.
 * Clips on locked tracks are never changed, and a linked partner is never
 * touched: keyframes belong to one clip. Isomorphic and pure.
 * Reference: docs/app-spec/EDL.md § Keyframes.
 * @module utils/edl/keyframes
 */

import { changeClip } from './immutable.js';
import { dropKey, easeKey, putKey, shiftKey } from './keyEdit.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * The animated paths an operation on "every key at a time" covers.
 * @param {import('./types.js').Clip} clip
 * @param {Iterable<string>} [paths] - Default: every animated path
 * @returns {string[]}
 */
const pathsOf = (clip, paths) => (paths ? [...paths] : Object.keys(clip.keyframes));

/**
 * Set a key: add one at `time`, or replace the value of the key that is
 * already there (within half a frame).
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path - e.g. `transform.x`, `effects.fx_1.radius`
 * @param {number} time - Timeline seconds
 * @param {number|string} value - A number, or a hex colour for colour properties
 * @param {{ ease?: string }} [opts] - Easing of the segment leaving the key
 *   (default: the replaced key's easing, `linear` for a new key)
 * @returns {Edl} Unchanged when the path cannot be animated in this clip or
 *   the value does not suit it
 */
export function setKeyframe(edl, clipId, path, time, value, opts = {}) {
  return changeClip(edl, clipId, (clip) => putKey(edl, clip, path, time, value, opts.ease));
}

/**
 * Remove the key at a time. Removing a property's last key ends its
 * animation and leaves the property at the value that key had.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @returns {Edl}
 */
export function removeKeyframe(edl, clipId, path, time) {
  return changeClip(edl, clipId, (clip, track) => dropKey(edl, clip, track, path, time));
}

/**
 * Move a key in time. A key already sitting at the destination is replaced.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path
 * @param {number} fromTime - Timeline seconds, where the key is
 * @param {number} toTime - Timeline seconds, where it should go
 * @returns {Edl}
 */
export function moveKeyframe(edl, clipId, path, fromTime, toTime) {
  return changeClip(edl, clipId, (clip) => shiftKey(edl, clip, path, fromTime, toTime));
}

/**
 * Change the easing of the segment that leaves a key.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @param {string} ease - One of `EASINGS`
 * @returns {Edl}
 */
export function setKeyframeEase(edl, clipId, path, time, ease) {
  return changeClip(edl, clipId, (clip) => easeKey(edl, clip, path, time, ease));
}

/**
 * Remove every key a clip has at a time — one marker on the timeline.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} time - Timeline seconds
 * @param {Iterable<string>} [paths] - Limit to these paths
 * @returns {Edl}
 */
export function removeKeyframesAt(edl, clipId, time, paths) {
  return changeClip(edl, clipId, (clip, track) =>
    pathsOf(clip, paths).reduce((next, path) => dropKey(edl, next, track, path, time), clip),
  );
}

/**
 * Move every key a clip has at a time — dragging one marker on the timeline.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} fromTime - Timeline seconds
 * @param {number} toTime - Timeline seconds
 * @param {Iterable<string>} [paths] - Limit to these paths
 * @returns {Edl}
 */
export function moveKeyframesAt(edl, clipId, fromTime, toTime, paths) {
  return changeClip(edl, clipId, (clip) =>
    pathsOf(clip, paths).reduce((next, path) => shiftKey(edl, next, path, fromTime, toTime), clip),
  );
}

/**
 * Remove the keys of one property, or every keyframe of the clip. The
 * properties go back to their plain values (what they were set to before
 * they were animated); use `setAnimated(…, false, time)` to keep the value
 * a property has at a moment instead.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} [path] - Default: every animated property
 * @returns {Edl}
 */
export function clearKeyframes(edl, clipId, path) {
  return changeClip(edl, clipId, (clip) => {
    const paths = Object.keys(clip.keyframes);
    if (path === undefined) return paths.length ? { ...clip, keyframes: {} } : clip;
    if (!Object.hasOwn(clip.keyframes, path)) return clip;
    const keyframes = { ...clip.keyframes };
    delete keyframes[path];
    return { ...clip, keyframes };
  });
}
