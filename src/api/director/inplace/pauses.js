/**
 * Pause bookkeeping for `remove_silence`: which timeline frames to cut out
 * of a clip, and re-linking the pieces of a split picture/sound pair.
 * @module api/director/inplace/pauses
 */

import { ceilFrames, floorFrames } from '#utils/director/snap.js';

/**
 * The pauses to remove from one clip, as timeline frame spans. Cuts are
 * rounded inward so no speech is lost, kept off the clip's fades, and (in
 * range mode) inside the range.
 * @param {any} clip
 * @param {{ start: number, end: number }[]} runs - Source stretches to keep
 * @param {{ fps: number, range: { start: number, end: number } | null }} env
 * @returns {[number, number][]}
 */
export function pauseSpans(clip, runs, env) {
  const toTimeline = (/** @type {number} */ source) => clip.timelineStart + source - clip.sourceIn;
  const from = Math.max(clip.timelineStart + clip.fadeIn, env.range?.start ?? 0);
  const to = Math.min(clip.timelineEnd - clip.fadeOut, env.range?.end ?? Infinity);
  const spans = [];
  let cursor = clip.sourceIn;
  for (const run of [...runs, { start: clip.sourceOut, end: clip.sourceOut }]) {
    const startF = ceilFrames(Math.max(from, toTimeline(cursor)), env.fps);
    const endF = floorFrames(Math.min(to, toTimeline(run.start)), env.fps);
    if (endF - startF >= 2) spans.push(/** @type {[number, number]} */ ([startF, endF]));
    cursor = Math.max(cursor, run.end);
  }
  return spans;
}

/**
 * Link the pieces of two split clips that cover the same frames.
 * @param {{ clip: any, span: [number, number] }[]} a
 * @param {{ clip: any, span: [number, number] }[]} b
 */
export function relink(a, b) {
  for (const piece of a) {
    const twin = b.find((p) => p.span[0] === piece.span[0] && p.span[1] === piece.span[1]);
    if (!twin) continue;
    piece.clip.linkedClipId = twin.clip.clipId;
    twin.clip.linkedClipId = piece.clip.clipId;
  }
}
