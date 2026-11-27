/**
 * Collapsing time out of a timeline: the maths behind `remove_silence`.
 * Removed stretches are cut out of the target clips (which split), while
 * every other clip keeps playing through and is shortened at its tail, so
 * a music bed is trimmed rather than chopped up.
 * @module api/director/inplace/collapse
 */

import { newId } from '#utils/edl/factory.js';
import { uncovered } from '../assemble/fragment.js';

/** @typedef {[number, number]} Span - [start, end) in frames */

/**
 * Sort spans and join the ones that touch or overlap.
 * @param {Span[]} spans
 * @returns {Span[]}
 */
export function mergeSpans(spans) {
  /** @type {Span[]} */
  const merged = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Where a frame lands once the removed spans are closed up. A frame inside
 * a removed span lands on the span's start.
 * @param {Span[]} removed - Merged, ascending
 * @returns {(frame: number) => number}
 */
export function timeMap(removed) {
  return (frame) => {
    let shift = 0;
    for (const [start, end] of removed) {
      if (frame <= start) break;
      shift += Math.min(frame, end) - start;
    }
    return frame - shift;
  };
}

/**
 * Keep a clip's fades no longer than the clip.
 * @param {any} clip
 * @returns {any} The same clip
 */
export function fitFades(clip) {
  const length = clip.timelineEnd - clip.timelineStart;
  const fades = clip.fadeIn + clip.fadeOut;
  if (fades > length && fades > 0) {
    clip.fadeIn = (clip.fadeIn / fades) * length;
    clip.fadeOut = (clip.fadeOut / fades) * length;
  }
  return clip;
}

/**
 * Cut the removed spans out of a clip.
 * @param {any} clip
 * @param {Span[]} removed - Merged, ascending
 * @param {number} fps
 * @returns {{ clip: any, span: Span }[]} The remaining pieces with the original frames
 *   each one covered; the first keeps the clip's id
 */
export function splitClip(clip, removed, fps) {
  const map = timeMap(removed);
  const startF = Math.round(clip.timelineStart * fps);
  const endF = Math.round(clip.timelineEnd * fps);
  const spans = uncovered(startF, endF, removed);
  return spans.map((span, k) => {
    const at = map(span[0]);
    const piece = {
      ...structuredClone(clip),
      clipId: k === 0 ? clip.clipId : newId('clip'),
      timelineStart: at / fps,
      timelineEnd: (at + span[1] - span[0]) / fps,
      sourceIn: clip.sourceIn + (span[0] - startF) / fps,
      sourceOut: clip.sourceIn + (span[1] - startF) / fps,
      fadeIn: k === 0 ? clip.fadeIn : 0,
      fadeOut: k === spans.length - 1 ? clip.fadeOut : 0,
      linkedClipId: '',
    };
    return { clip: fitFades(piece), span };
  });
}

/**
 * Move a bystander clip along with the collapse: its start follows the
 * timeline and any removed time it spanned comes off its tail.
 * @param {any} clip
 * @param {Span[]} removed - Merged, ascending
 * @param {number} fps
 * @returns {any|null} The clip (untouched when nothing changed), or null when
 *   nothing of it is left
 */
export function rippleClip(clip, removed, fps) {
  const map = timeMap(removed);
  const startF = Math.round(clip.timelineStart * fps);
  const endF = Math.round(clip.timelineEnd * fps);
  const at = map(startF);
  const length = map(endF) - at;
  if (length < 1) return null;
  if (at === startF && length === endF - startF) return clip;
  return fitFades({
    ...clip,
    timelineStart: at / fps,
    timelineEnd: (at + length) / fps,
    sourceOut: clip.sourceIn + length / fps,
  });
}

/**
 * Re-state overlaps on a track as cross-fade pairs after clips have moved.
 * @param {any[]} clips
 * @returns {any[]} Sorted by start
 */
export function fixCrossfades(clips) {
  const sorted = [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
  for (let i = 1; i < sorted.length; i++) {
    const overlap = sorted[i - 1].timelineEnd - sorted[i].timelineStart;
    if (overlap <= 1e-6) continue;
    sorted[i - 1].fadeOut = overlap;
    sorted[i].fadeIn = overlap;
  }
  return sorted;
}
