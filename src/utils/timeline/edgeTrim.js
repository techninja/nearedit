/**
 * Edge-trim mode: one edge of one clip is chosen with the keyboard (Vegas:
 * `[` / `]`, or 7 / 9 on the keypad) and the nudge keys then trim that edge
 * instead of moving the clip. The stage draws the chosen edge; the mode
 * ends with Escape, keypad 5, a press on the timeline, or when the clip is
 * gone. There is one timeline, so one record is enough.
 * @module utils/timeline/edgeTrim
 */

import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';

/** @typedef {{ clipId: string, edge: 'start'|'end' }} EdgeTrim */

/** @type {EdgeTrim|null} */
let chosen = null;
/** @type {Set<() => void>} */
const listeners = new Set();

/** @returns {EdgeTrim|null} The chosen edge, or null when the mode is off */
export function getEdgeTrim() {
  if (chosen && !findClip(getDoc(), chosen.clipId)) chosen = null;
  return chosen;
}

/**
 * Choose an edge, or leave the mode.
 * @param {EdgeTrim|null} next
 */
export function setEdgeTrim(next) {
  if (next === chosen || (!next && !chosen)) return;
  chosen = next;
  for (const listener of listeners) listener();
}

/**
 * @param {() => void} listener - Called when the chosen edge changes
 * @returns {() => void} unsubscribe
 */
export function onEdgeTrim(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The edge before or after an edge along its track: a clip's start, its
 * end, the next clip's start… Pure.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {EdgeTrim} from
 * @param {1|-1} direction
 * @returns {EdgeTrim|null} null at the first or last edge of the track
 */
export function stepEdge(doc, from, direction) {
  const ref = findClip(doc, from.clipId);
  if (!ref) return null;
  if (direction > 0 && from.edge === 'start') return { clipId: from.clipId, edge: 'end' };
  if (direction < 0 && from.edge === 'end') return { clipId: from.clipId, edge: 'start' };
  const other = ref.track.clips[ref.clipIndex + direction];
  return other ? { clipId: other.clipId, edge: direction > 0 ? 'start' : 'end' } : null;
}
