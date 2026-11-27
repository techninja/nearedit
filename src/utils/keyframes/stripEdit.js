/**
 * Edits the keyframe strip makes to several keys at once: move them by the
 * same amount, delete them, give them an easing. Keys are named by their
 * property path and timeline time. Pure and isomorphic.
 * @module utils/keyframes/stripEdit
 */

import { moveKeyframe, removeKeyframe, setKeyframeEase } from '#utils/edl/keyframes.js';
import { snap } from '#utils/edl/time.js';
import { keyId } from './strip.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {{ path: string, time: number }} KeyRef */

/**
 * Move keys by the same amount of time. Keys are moved leading edge first,
 * so a key never lands on a selected neighbour that has yet to move; a key
 * that lands on one that is not part of the move replaces it.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {KeyRef[]} keys
 * @param {number} delta - Seconds, positive = later
 * @returns {Edl}
 */
export function moveKeys(edl, clipId, keys, delta) {
  if (!delta) return edl;
  const ordered = [...keys].sort((a, b) => (delta > 0 ? b.time - a.time : a.time - b.time));
  return ordered.reduce(
    (doc, key) => moveKeyframe(doc, clipId, key.path, key.time, key.time + delta),
    edl,
  );
}

/**
 * The ids the moved keys have afterwards, so they stay selected.
 * @param {Edl} edl
 * @param {KeyRef[]} keys
 * @param {number} delta
 * @returns {string[]}
 */
export function movedIds(edl, keys, delta) {
  return keys.map((key) => keyId(key.path, delta ? snap(edl, key.time + delta) : key.time));
}

/**
 * @param {Edl} edl
 * @param {string} clipId
 * @param {KeyRef[]} keys
 * @returns {Edl}
 */
export function deleteKeys(edl, clipId, keys) {
  return keys.reduce((doc, key) => removeKeyframe(doc, clipId, key.path, key.time), edl);
}

/**
 * @param {Edl} edl
 * @param {string} clipId
 * @param {KeyRef[]} keys
 * @param {string} ease - One of `EASINGS`
 * @returns {Edl}
 */
export function setEase(edl, clipId, keys, ease) {
  return keys.reduce((doc, key) => setKeyframeEase(doc, clipId, key.path, key.time, ease), edl);
}

/**
 * The easing a set of keys shares.
 * @param {{ ease: string }[]} keys
 * @returns {string} '' when there are none or they differ
 */
export function sharedEase(keys) {
  const eases = new Set(keys.map((key) => key.ease));
  return eases.size === 1 ? [...eases][0] : '';
}
