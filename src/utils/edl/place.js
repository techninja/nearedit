/**
 * Placing one clip onto a track that is already valid — the heart of the
 * Vegas overlap rule. A partial overlap may stay as a cross-fade; anything
 * else (containment, or a third clip in the overlap) is an overwrite: the
 * placed clip wins and what is under it is trimmed, split or removed.
 * Isomorphic and pure.
 * @module utils/edl/place
 */

import { cutAround, intersects, isCrossfadeShape } from './clipMath.js';
import { sortClips } from './immutable.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * @typedef {Object} PlaceContext
 * @property {(under: Clip, placed: Clip) => boolean} fade - May this pair
 *   cross-fade (auto-crossfade on, or the pair was already cross-fading)?
 * @property {(clip: Clip) => boolean} timed - Is the clip video/audio?
 * @property {(under: Clip, pieces: Clip[], placed: Clip) => void} [onCut] -
 *   Called for every clip that is overwritten, with what is left of it
 */

/**
 * @param {Clip} third
 * @param {Clip} a
 * @param {Clip} b
 * @returns {boolean} True when `third` covers part of the overlap of a and b
 */
function coversOverlap(third, a, b) {
  const start = Math.max(a.timelineStart, b.timelineStart);
  const end = Math.min(a.timelineEnd, b.timelineEnd);
  return third.timelineStart < end - EPS && third.timelineEnd > start + EPS;
}

/**
 * Add `clip` to a valid clip list and keep the list valid.
 * @param {Clip[]} placed - Clips already on the track (no illegal overlaps)
 * @param {Clip} clip - The incoming clip; it is never modified
 * @param {PlaceContext} ctx
 * @returns {Clip[]} Sorted clip list including `clip`
 */
export function placeClip(placed, clip, ctx) {
  const hits = placed.filter((other) => intersects(other, clip));
  if (!hits.length) return sortClips([...placed, clip]);
  const out = [];
  for (const under of placed) {
    if (!hits.includes(under)) {
      out.push(under);
      continue;
    }
    const crowded = hits.some((third) => third !== under && coversOverlap(third, under, clip));
    if (!crowded && isCrossfadeShape(under, clip) && ctx.fade(under, clip)) {
      out.push(under);
      continue;
    }
    const pieces = cutAround(under, clip.timelineStart, clip.timelineEnd, ctx.timed(under));
    ctx.onCut?.(under, pieces, clip);
    out.push(...pieces);
  }
  out.push(clip);
  return sortClips(out);
}

/**
 * Make an arbitrary clip list valid by placing its clips one at a time in
 * start order: partial overlaps become cross-fades, a clip that lands inside
 * or over another overwrites it. Used to repair loaded and generated
 * documents, where no clip is "the one being moved".
 * @param {Clip[]} clips
 * @param {(clip: Clip) => boolean} timed
 * @returns {Clip[]}
 */
export function resolveAll(clips, timed) {
  /** @type {Clip[]} */
  let placed = [];
  const ctx = { fade: () => true, timed };
  for (const clip of sortClips(clips)) placed = placeClip(placed, clip, ctx);
  return placed;
}
