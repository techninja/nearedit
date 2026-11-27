/**
 * Keyframe edits on whole clips, as the timeline's commands make them:
 * add or remove a key at a moment for every property a clip animates,
 * clear a clip's animation, step from key to key. Pure and isomorphic.
 * @module utils/keyframes/clipKeys
 */

import { animatedPaths, keyframeTimes } from '#utils/edl/keyframeQuery.js';
import { clearKeyframes, removeKeyframesAt, setKeyframe } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';
import { EPS } from '#utils/edl/time.js';
import { keyReach } from './state.js';
import { currentValue } from './values.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * The clips of a list of ids that have keyframes.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @returns {any[]}
 */
export function animatedClips(edl, clipIds) {
  return clipIds
    .map((clipId) => findClip(edl, clipId)?.clip)
    .filter((clip) => clip && animatedPaths(clip).length > 0);
}

/** @type {(clip: any, time: number) => boolean} */
const covers = (clip, time) => time >= clip.timelineStart - EPS && time <= clip.timelineEnd + EPS;

/**
 * Put a key at a moment on every property the clips animate, holding the
 * value each has there. Clips the moment lies outside of are left alone.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {number} time - Timeline seconds
 * @returns {Edl}
 */
export function addKeysAt(edl, clipIds, time) {
  return animatedClips(edl, clipIds)
    .filter((clip) => covers(clip, time))
    .reduce(
      (doc, clip) =>
        animatedPaths(clip).reduce(
          (next, path) =>
            setKeyframe(next, clip.clipId, path, time, currentValue(clip, path, time)),
          doc,
        ),
      edl,
    );
}

/**
 * Remove every key the clips have at a moment.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {number} time
 * @returns {Edl}
 */
export function removeKeysAt(edl, clipIds, time) {
  return clipIds.reduce((doc, clipId) => removeKeyframesAt(doc, clipId, time), edl);
}

/**
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @param {number} time
 * @returns {boolean} True when one of the clips has a key at that moment
 */
export function hasKeysAt(edl, clipIds, time) {
  const reach = keyReach(edl.fps);
  return animatedClips(edl, clipIds).some((clip) =>
    keyframeTimes(clip, { within: false }).some((at) => Math.abs(at - time) <= reach),
  );
}

/**
 * Remove every keyframe of the clips; their properties return to the
 * plain values underneath.
 * @param {Edl} edl
 * @param {string[]} clipIds
 * @returns {Edl}
 */
export function clearAllKeys(edl, clipIds) {
  return clipIds.reduce((doc, clipId) => clearKeyframes(doc, clipId), edl);
}

/**
 * The key time to step to from a moment.
 * @param {Edl} edl
 * @param {string[]} clipIds - Usually the selection
 * @param {number} time
 * @param {1|-1} direction - 1 = next, -1 = previous
 * @returns {number|null} null when the clips have no key that way
 */
export function stepKeyTime(edl, clipIds, time, direction) {
  const reach = keyReach(edl.fps);
  const times = animatedClips(edl, clipIds)
    .flatMap((clip) => keyframeTimes(clip))
    .filter((at) => (direction > 0 ? at > time + reach : at < time - reach));
  if (!times.length) return null;
  return direction > 0 ? Math.min(...times) : Math.max(...times);
}
