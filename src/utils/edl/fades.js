/**
 * Fade bookkeeping for invariants 3 and 4.
 *
 * A fade on a clip edge is either automatic (it exists because the edge
 * overlaps a neighbour: a cross-fade) or deliberate (set by the user on a
 * free edge). The rule that tells them apart is stateless: an edge that
 * overlapped a neighbour in the document *before* the operation carried an
 * automatic fade. Isomorphic and pure.
 * @module utils/edl/fades
 */

import { sortClips } from './immutable.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * Overlap of a clip with its neighbours on the same track.
 * @typedef {Object} EdgeOverlap
 * @property {number} in - Seconds shared with the previous clip, 0 when free
 * @property {number} out - Seconds shared with the next clip, 0 when free
 * @property {string} prev - clipId of the clip it fades in over
 * @property {string} next - clipId of the clip that fades in over it
 */

/** Fades closer than this to the wanted value are left alone (float noise). */
const SAME = 1e-9;

/** @type {EdgeOverlap} */
export const NO_OVERLAP = Object.freeze({ in: 0, out: 0, prev: '', next: '' });

/**
 * Overlaps between neighbouring clips of one track.
 * @param {Clip[]} clips - One track's clips (a valid track: no triple overlap)
 * @returns {Map<string, EdgeOverlap>} Only clips that overlap something
 */
export function neighbourOverlaps(clips) {
  const sorted = sortClips(clips);
  /** @type {Map<string, EdgeOverlap>} */
  const map = new Map();
  const entry = (id) => map.get(id) || map.set(id, { ...NO_OVERLAP }).get(id);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const length = Math.min(a.timelineEnd, b.timelineEnd) - b.timelineStart;
    if (length <= EPS) continue;
    Object.assign(entry(a.clipId), { out: length, next: b.clipId });
    Object.assign(entry(b.clipId), { in: length, prev: a.clipId });
  }
  return map;
}

/**
 * Fit a clip's fades into its duration (invariant 3). A fade locked to an
 * overlap never gives way; a deliberate one is shortened.
 * @param {number} fadeIn
 * @param {number} fadeOut
 * @param {number} duration
 * @param {boolean} inLocked
 * @param {boolean} outLocked
 * @returns {[number, number]}
 */
export function fitFades(fadeIn, fadeOut, duration, inLocked, outLocked) {
  if (fadeIn + fadeOut <= duration + EPS) return [fadeIn, fadeOut];
  if (inLocked && !outLocked) return [fadeIn, Math.max(0, duration - fadeIn)];
  if (outLocked && !inLocked) return [Math.max(0, duration - fadeOut), fadeOut];
  const first = Math.min(fadeIn, duration);
  return [first, Math.min(fadeOut, duration - first)];
}

/**
 * Give every clip of a resolved track its final fades:
 * an overlapping edge fades for exactly the overlap, an edge that used to
 * overlap and no longer does goes back to 0, any other fade is deliberate
 * and kept (shortened only when it no longer fits).
 * @param {Clip[]} clips - Sorted, already free of illegal overlaps
 * @param {(clipId: string) => EdgeOverlap|undefined} [before] - The clip's
 *   overlaps in the document before the operation
 * @returns {Clip[]}
 */
export function settleFades(clips, before = () => undefined) {
  const now = neighbourOverlaps(clips);
  return clips.map((clip) => {
    const is = now.get(clip.clipId) || NO_OVERLAP;
    const was = before(clip.clipId) || NO_OVERLAP;
    const wantIn = is.in > EPS ? is.in : was.in > EPS ? 0 : Math.max(0, clip.fadeIn);
    const wantOut = is.out > EPS ? is.out : was.out > EPS ? 0 : Math.max(0, clip.fadeOut);
    const duration = clip.timelineEnd - clip.timelineStart;
    const [fadeIn, fadeOut] = fitFades(wantIn, wantOut, duration, is.in > EPS, is.out > EPS);
    const same = Math.abs(fadeIn - clip.fadeIn) + Math.abs(fadeOut - clip.fadeOut) < SAME;
    return same ? clip : { ...clip, fadeIn, fadeOut };
  });
}
