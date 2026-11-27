/**
 * Placing clips onto a track that is already valid — the heart of the
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
 * @property {(clip: Clip) => boolean} [timed] - Unused since v3: every clip
 *   has a source window, so every cut moves it
 * @property {(under: Clip, placed: Clip) => boolean} fade - May a new
 *   partial overlap of this pair become a cross-fade?
 * @property {(under: Clip, pieces: Clip[], placed: Clip) => void} [onCut] -
 *   Called for every clip that is overwritten, with what is left of it
 */

/**
 * Add `clip` to a valid clip list.
 * @param {Clip[]} placed - Clips already on the track, sorted
 * @param {Clip} clip - The incoming clip; it is never modified
 * @param {PlaceContext} ctx
 * @returns {Clip[]} Sorted clip list including `clip`
 */
export function placeClip(placed, clip, ctx) {
  // On a valid track clips end in the order they start, so the first clip
  // that reaches `clip` is found by bisection; the ones it overlaps follow.
  let from = 0;
  for (let high = placed.length; from < high; ) {
    const mid = (from + high) >> 1;
    if (placed[mid].timelineEnd > clip.timelineStart + EPS) high = mid;
    else from = mid + 1;
  }
  from = Math.max(0, from - 1);
  let to = from;
  while (to < placed.length && placed[to].timelineStart < clip.timelineEnd - EPS) to++;
  const near = placed.slice(from, to);
  const hits = near.filter((other) => intersects(other, clip));
  const crowds = (third, under) =>
    third !== under &&
    third.timelineStart < Math.min(under.timelineEnd, clip.timelineEnd) - EPS &&
    third.timelineEnd > Math.max(under.timelineStart, clip.timelineStart) + EPS;
  const middle = [];
  for (const under of near) {
    const fits = isCrossfadeShape(under, clip) && ctx.fade(under, clip);
    if (!hits.includes(under) || (fits && !hits.some((third) => crowds(third, under)))) {
      middle.push(under);
      continue;
    }
    const pieces = cutAround(under, clip.timelineStart, clip.timelineEnd);
    ctx.onCut?.(under, pieces, clip);
    middle.push(...pieces);
  }
  middle.push(clip);
  return [...placed.slice(0, from), ...sortClips(middle), ...placed.slice(to)];
}

/**
 * Safety net after placing: cut whatever still overlaps illegally — a
 * cross-fade whose partner was trimmed by a later placement, or three clips
 * over one point. Terminates because every cut removes one intersection.
 * @param {Clip[]} clips
 * @param {PlaceContext} ctx
 * @param {(a: Clip, b: Clip) => boolean} [outranks] - True when `a` must
 *   win over the later clip `b`; by default the later clip wins
 * @returns {Clip[]} A valid, sorted clip list
 */
export function enforce(clips, ctx, outranks = () => false) {
  let list = sortClips(clips);
  const legal = (a, b) => !intersects(a, b) || isCrossfadeShape(a, b);
  for (;;) {
    let pair = null;
    for (let i = 0; i + 1 < list.length && !pair; i++) {
      if (!legal(list[i], list[i + 1])) pair = [list[i], list[i + 1]];
      else if (list[i + 2] && intersects(list[i], list[i + 2])) pair = [list[i], list[i + 2]];
    }
    if (!pair) return list;
    const [winner, loser] = outranks(pair[0], pair[1]) ? pair : [pair[1], pair[0]];
    const pieces = cutAround(loser, winner.timelineStart, winner.timelineEnd);
    ctx.onCut?.(loser, pieces, winner);
    list = sortClips(list.flatMap((clip) => (clip === loser ? pieces : clip)));
  }
}

/**
 * Make an arbitrary clip list valid, for loaded and generated documents
 * where no clip is "the one being moved". Clips are placed in start order:
 * partial overlaps become (or stay) cross-fades, and a clip that lands
 * inside or over another overwrites it — the later clip wins.
 * @param {Clip[]} clips
 * @returns {Clip[]}
 */
export function resolveAll(clips) {
  const ctx = { fade: () => true };
  /** @type {Clip[]} */
  let placed = [];
  for (const clip of sortClips(clips)) placed = placeClip(placed, clip, ctx);
  return enforce(placed, ctx);
}
