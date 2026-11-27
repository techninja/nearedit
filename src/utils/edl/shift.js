/**
 * Building blocks of ripple edits: shifting many clips at once and simple
 * arithmetic on time spans. Isomorphic and pure.
 * @module utils/edl/shift
 */

import { shiftClip } from './clipMath.js';
import { mapClips } from './immutable.js';
import { EPS, fpsOf } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {[number, number]} Span - [start, end] in seconds */

/**
 * Shift clips in time. Clips on locked tracks never move.
 * @param {Edl} edl
 * @param {(clip: Clip, track: Track) => number} amount - Seconds for each
 *   clip; 0 leaves it alone
 * @returns {{ edl: Edl, moved: string[] }} The result and the ids that moved
 */
export function shiftClips(edl, amount) {
  const fps = fpsOf(edl);
  /** @type {string[]} */
  const moved = [];
  const out = mapClips(edl, (clip, track) => {
    const delta = amount(clip, track);
    if (!delta) return clip;
    moved.push(clip.clipId);
    return shiftClip(clip, delta, fps);
  });
  return { edl: out, moved };
}

/**
 * @param {Span[]} spans
 * @returns {Span[]} Sorted, with overlapping and touching spans merged
 */
export function mergeSpans(spans) {
  /** @type {Span[]} */
  const out = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && start <= last[1] + EPS) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/**
 * @param {Span[]} spans
 * @param {Span[]} holes
 * @returns {Span[]} The parts of `spans` not covered by any of `holes`
 */
export function subtractSpans(spans, holes) {
  let out = mergeSpans(spans);
  for (const [from, to] of mergeSpans(holes)) {
    out = out.flatMap(([start, end]) => {
      if (to <= start + EPS || from >= end - EPS) return [[start, end]];
      /** @type {Span[]} */
      const left = from - start > EPS ? [[start, from]] : [];
      /** @type {Span[]} */
      const right = end - to > EPS ? [[to, end]] : [];
      return [...left, ...right];
    });
  }
  return out;
}

/**
 * Total length of the spans that end at or before a time — how far something
 * at `time` moves left when those spans are closed.
 * @param {Span[]} spans
 * @param {number} time
 * @returns {number}
 */
export function closedBefore(spans, time) {
  let total = 0;
  for (const [start, end] of spans) if (end <= time + EPS) total += end - start;
  return total;
}
