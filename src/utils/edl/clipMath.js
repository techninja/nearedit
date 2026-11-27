/**
 * Single-clip arithmetic: shifting, slicing and cutting one clip while
 * keeping invariant 1 (duration equals source range). Isomorphic and pure.
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
 * the frame grid.
 * @param {Clip} clip
 * @param {number} delta - Seconds
 * @param {number} fps
 * @returns {Clip}
 */
export function shiftClip(clip, delta, fps) {
  const timelineStart = snapToFrame(clip.timelineStart + delta, fps);
  const timelineEnd = snapToFrame(clip.timelineEnd + delta, fps);
  const drift = timelineEnd - timelineStart - (clip.timelineEnd - clip.timelineStart);
  const sourceOut = Math.abs(drift) > EPS ? clip.sourceOut + drift : clip.sourceOut;
  return { ...clip, timelineStart, timelineEnd, sourceOut };
}

/**
 * The part of a clip between two timeline times. A cut edge loses its fade;
 * a piece that gets a new id starts unlinked.
 * @param {Clip} clip
 * @param {number} start
 * @param {number} end
 * @param {boolean} timed - Video/audio: the source range follows the cut
 * @param {string} [clipId] - Id of the piece, the clip's own by default
 * @returns {Clip}
 */
export function sliceClip(clip, start, end, timed, clipId = clip.clipId) {
  const sourceIn = timed ? clip.sourceIn + (start - clip.timelineStart) : clip.sourceIn;
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
 * @param {boolean} timed
 * @returns {Clip[]} Zero, one or two pieces
 */
export function cutAround(clip, from, to, timed) {
  const pieces = [];
  if (from - clip.timelineStart > EPS) {
    pieces.push(sliceClip(clip, clip.timelineStart, from, timed));
  }
  if (clip.timelineEnd - to > EPS) {
    const id = pieces.length ? newId('clip') : clip.clipId;
    pieces.push(sliceClip(clip, to, clip.timelineEnd, timed, id));
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
