/**
 * Placing clips onto a track that is already valid — the heart of the
 * Vegas overlap rule. A partial overlap may stay as a cross-fade; anything
 * else (containment, or a third clip in the overlap) is an overwrite: the
 * placed clip wins and what is under it is trimmed, split or removed.
 * Isomorphic and pure.
 * @module utils/edl/place
 */

import { cutAround, intersects, isCrossfadeShape } from './clipMath.js';
import { compareClips, sortClips } from './immutable.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * @typedef {Object} PlaceContext
 * @property {(clip: Clip) => boolean} timed - Is the clip video/audio?
 * @property {(under: Clip, placed: Clip) => boolean} fade - May a new
 *   partial overlap of this pair become a cross-fade?
 * @property {(a: Clip, b: Clip) => boolean} [kept] - Is this pair an
 *   existing cross-fade that must survive as it is?
 * @property {(under: Clip, pieces: Clip[], placed: Clip) => void} [onCut] -
 *   Called for every clip that is overwritten, with what is left of it
 */

/**
 * The loosest overlap that still reads as a cross-fade: in track order the
 * second clip does not end before the first. Unlike `isCrossfadeShape` it
 * allows shared edges, which only a split inside a cross-fade produces.
 * @param {Clip} a
 * @param {Clip} b
 * @returns {boolean}
 */
export function isOrderedOverlap(a, b) {
  const [first, second] = compareClips(a, b) <= 0 ? [a, b] : [b, a];
  return intersects(a, b) && second.timelineEnd - first.timelineEnd > -EPS;
}

/**
 * Add `clip` to a valid clip list.
 * @param {Clip[]} placed - Clips already on the track (no illegal overlaps)
 * @param {Clip} clip - The incoming clip; it is never modified
 * @param {PlaceContext} ctx
 * @returns {Clip[]} Sorted clip list including `clip`
 */
export function placeClip(placed, clip, ctx) {
  const hits = placed.filter((other) => intersects(other, clip));
  if (!hits.length) return sortClips([...placed, clip]);
  const crowds = (third, under) =>
    third !== under &&
    third.timelineStart < Math.min(under.timelineEnd, clip.timelineEnd) - EPS &&
    third.timelineEnd > Math.max(under.timelineStart, clip.timelineStart) + EPS;
  const out = [];
  for (const under of placed) {
    const hit = hits.includes(under);
    const fits =
      ctx.kept?.(under, clip) || (isCrossfadeShape(under, clip) && ctx.fade(under, clip));
    if (!hit || (fits && !hits.some((third) => crowds(third, under)))) {
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
  const legal = (a, b) => !intersects(a, b) || isCrossfadeShape(a, b) || !!ctx.kept?.(a, b);
  for (;;) {
    let pair = null;
    for (let i = 0; i + 1 < list.length && !pair; i++) {
      if (!legal(list[i], list[i + 1])) pair = [list[i], list[i + 1]];
      else if (list[i + 2] && intersects(list[i], list[i + 2])) pair = [list[i], list[i + 2]];
    }
    if (!pair) return list;
    const [winner, loser] = outranks(pair[0], pair[1]) ? pair : [pair[1], pair[0]];
    const pieces = cutAround(loser, winner.timelineStart, winner.timelineEnd, ctx.timed(loser));
    ctx.onCut?.(loser, pieces, winner);
    list = sortClips(list.flatMap((clip) => (clip === loser ? pieces : clip)));
  }
}

/**
 * Make an arbitrary clip list valid, for loaded and generated documents
 * where no clip is "the one being moved". Clips are placed in start order:
 * a pair that already is a cross-fade is kept, other partial overlaps
 * become cross-fades, and a clip that lands inside or over another
 * overwrites it (the later clip wins).
 * @param {Clip[]} clips
 * @param {(clip: Clip) => boolean} timed
 * @returns {Clip[]}
 */
export function resolveAll(clips, timed) {
  const kept = (a, b) => {
    const [first, second] = compareClips(a, b) <= 0 ? [a, b] : [b, a];
    const overlap = Math.min(first.timelineEnd, second.timelineEnd) - second.timelineStart;
    const faded = Math.abs(first.fadeOut - overlap) + Math.abs(second.fadeIn - overlap) <= EPS;
    return isOrderedOverlap(a, b) && faded;
  };
  const ctx = { fade: () => true, timed, kept };
  /** @type {Clip[]} */
  let placed = [];
  for (const clip of sortClips(clips)) placed = placeClip(placed, clip, ctx);
  return enforce(placed, ctx);
}
