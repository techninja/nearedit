/**
 * What the keyframe button beside an inspector field does to the document:
 * add or remove the key under the playhead, stop animating, change an
 * easing. Each takes the clips and the property paths the field drives, so
 * "Position" keys X and Y together. Times are timeline times and are kept
 * inside the clip. Pure and isomorphic.
 * @module utils/keyframes/actions
 */

import { setAnimated } from '#utils/edl/autoKey.js';
import { isAnimated } from '#utils/edl/keyframeQuery.js';
import { removeKeyframe, setKeyframe, setKeyframeEase } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';
import { keyframeState } from './state.js';
import { currentValue } from './values.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * Run a change for every existing clip and path.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} time
 * @param {(doc: Edl, clip: any, path: string, at: number) => Edl} change
 * @returns {Edl}
 */
function forEach(edl, clipIds, paths, time, change) {
  let doc = edl;
  for (const clipId of clipIds) {
    for (const path of paths) {
      const clip = findClip(doc, clipId)?.clip;
      if (!clip) continue;
      const at = Math.min(clip.timelineEnd, Math.max(clip.timelineStart, time));
      doc = change(doc, clip, path, at);
    }
  }
  return doc;
}

/**
 * Put a key under the playhead holding the value the property has there.
 * A property that was not animated starts being animated.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} time - Timeline seconds
 * @returns {Edl}
 */
export function addKeys(edl, clipIds, paths, time) {
  return forEach(edl, clipIds, paths, time, (doc, clip, path, at) => {
    const value = currentValue(clip, path, at);
    return isAnimated(clip, path)
      ? setKeyframe(doc, clip.clipId, path, at, value)
      : setAnimated(doc, clip.clipId, path, true, at, { value });
  });
}

/**
 * Remove the keys under the playhead. A property whose last key goes keeps
 * that key's value and is no longer animated.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} time
 * @returns {Edl}
 */
export function removeKeys(edl, clipIds, paths, time) {
  return forEach(edl, clipIds, paths, time, (doc, clip, path, at) =>
    removeKeyframe(doc, clip.clipId, path, at),
  );
}

/**
 * The keyframe button itself: with a key under the playhead it removes it,
 * otherwise it adds one (which also turns animation on).
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} time
 * @param {number} [fps]
 * @returns {Edl}
 */
export function toggleKey(edl, clipIds, paths, time, fps = edl.fps) {
  const clips = clipIds.flatMap((id) => findClip(edl, id)?.clip || []);
  if (!clips.length) return edl;
  const at = Math.min(clips[0].timelineEnd, Math.max(clips[0].timelineStart, time));
  const onKey = keyframeState(clips, paths, at, fps).state === 'key';
  return onKey ? removeKeys(edl, clipIds, paths, time) : addKeys(edl, clipIds, paths, time);
}

/**
 * Stop animating: every key goes and each property keeps the value it has
 * under the playhead.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} time
 * @returns {Edl}
 */
export function stopAnimation(edl, clipIds, paths, time) {
  return forEach(edl, clipIds, paths, time, (doc, clip, path, at) =>
    setAnimated(doc, clip.clipId, path, false, at),
  );
}

/**
 * Set the easing of the keys at a time (the "current key" of `keyframeState`).
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {string[]} paths
 * @param {number} keyTime - Timeline time of the keys
 * @param {string} ease - One of `EASINGS`
 * @returns {Edl}
 */
export function easeKeys(edl, clipIds, paths, keyTime, ease) {
  let doc = edl;
  for (const clipId of clipIds) {
    for (const path of paths) doc = setKeyframeEase(doc, clipId, path, keyTime, ease);
  }
  return doc;
}
