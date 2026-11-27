/**
 * Single-clip arithmetic: shifting, slicing and cutting one clip while
 * keeping invariant 1 (duration equals source range) — for every kind of
 * clip, so keyframes and generator motion stay attached to the content.
 * Isomorphic and pure.
 * @module utils/edl/clipMath
 */

import { newId } from './factory.js';
import { snapToFrame } from './query.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/** @typedef {{ timelineStart: number, timelineEnd: number }} Span */

/**
 * @param {Span} a
 * @param {Span} b
 * @returns {boolean} True when the two spans share more than a touching edge
 */
export function intersects(a, b) {
  const start = Math.max(a.timelineStart, b.timelineStart);
  return Math.min(a.timelineEnd, b.timelineEnd) - start > EPS;
}

/**
 * The only overlap two clips may keep: one starts first and ends first, so
 * the earlier one can fade out while the later one fades in.
 * @param {Span} a
 * @param {Span} b
 * @returns {boolean}
 */
export function isCrossfadeShape(a, b) {
  const [first, second] = a.timelineStart <= b.timelineStart ? [a, b] : [b, a];
  return (
    intersects(a, b) &&
    second.timelineStart - first.timelineStart > EPS &&
    second.timelineEnd - first.timelineEnd > EPS
  );
}

/**
 * Move a clip in time without touching what it shows. Both edges land on
 * the frame grid — except for a clip shorter than a frame (a sliver left by
 * a cut in a document that is off the grid because its `fps` changed),
 * which keeps its length rather than collapsing to nothing.
 * @param {Clip} clip
 * @param {number} delta - Seconds
 * @param {number} fps
 * @returns {Clip}
 */
export function shiftClip(clip, delta, fps) {
  const length = clip.timelineEnd - clip.timelineStart;
  const timelineStart = snapToFrame(clip.timelineStart + delta, fps);
  const snappedEnd = snapToFrame(clip.timelineEnd + delta, fps);
  const timelineEnd = snappedEnd - timelineStart > EPS ? snappedEnd : timelineStart + length;
  const drift = timelineEnd - timelineStart - length;
  const sourceOut = Math.abs(drift) > EPS ? clip.sourceOut + drift : clip.sourceOut;
  return { ...clip, timelineStart, timelineEnd, sourceOut };
}

/**
 * The part of a clip between two timeline times. Its source window follows
 * the cut, so what the clip shows at any moment — footage, keyframed
 * values, generator motion — stays where it was. A cut edge loses its fade;
 * a piece that gets a new id starts unlinked. Effects and keyframes are
 * shared with the original: both halves of a split carry the full lists.
 * @param {Clip} clip
 * @param {number} start
 * @param {number} end
 * @param {boolean} [_timed] - Unused since v3 (every clip has a source
 *   window); kept so existing callers need not change
 * @param {string} [clipId] - Id of the piece, the clip's own by default
 * @returns {Clip}
 */
export function sliceClip(clip, start, end, _timed, clipId = clip.clipId) {
  const sourceIn = clip.sourceIn + (start - clip.timelineStart);
  return {
    ...clip,
    clipId,
    linkedClipId: clipId === clip.clipId ? clip.linkedClipId : '',
    timelineStart: start,
    timelineEnd: end,
    sourceIn,
    sourceOut: sourceIn + (end - start),
    fadeIn: start - clip.timelineStart > EPS ? 0 : clip.fadeIn,
    fadeOut: clip.timelineEnd - end > EPS ? 0 : clip.fadeOut,
  };
}

/**
 * Remove a time range from a clip. The first surviving piece keeps the
 * clip's id; a second piece gets a new one.
 * @param {Clip} clip
 * @param {number} from
 * @param {number} to
 * @param {boolean} [_timed] - Unused since v3, see `sliceClip`
 * @returns {Clip[]} Zero, one or two pieces
 */
export function cutAround(clip, from, to, _timed) {
  const pieces = [];
  if (from - clip.timelineStart > EPS) {
    pieces.push(sliceClip(clip, clip.timelineStart, from));
  }
  if (clip.timelineEnd - to > EPS) {
    const id = pieces.length ? newId('clip') : clip.clipId;
    pieces.push(sliceClip(clip, to, clip.timelineEnd, undefined, id));
  }
  return pieces;
}

/**
 * Keep the previous object when an edit left a clip exactly as it was.
 * @param {Clip|undefined} previous
 * @param {Clip} next
 * @returns {Clip}
 */
export function reuseClip(previous, next) {
  if (!previous || previous === next) return next;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(previous).length) return next;
  return keys.every((key) => previous[key] === next[key]) ? previous : next;
}
