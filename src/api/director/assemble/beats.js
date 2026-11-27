/**
 * Beat maths for the assembler: the music bed's beats as timeline frames,
 * and clip lengths that end on one.
 * @module api/director/assemble/beats
 */

import { nearestIndex, toFrames } from '#utils/director/snap.js';

/**
 * Beats of the music bed as timeline frames (the bed starts at frame 0,
 * playing from `music.start` in its file).
 * @param {{ media: { beats: number[] }, start: number } | null} music
 * @param {number} fps
 * @param {number} [every=1] - Keep every Nth beat
 * @returns {number[]} Ascending, distinct
 */
export function beatFrames(music, fps, every = 1) {
  if (!music) return [];
  const frames = music.media.beats
    .filter((b) => b >= music.start - 1e-6)
    .filter((_, i) => i % Math.max(1, every) === 0)
    .map((b) => toFrames(b - music.start, fps));
  return [...new Set(frames)];
}

/**
 * Length for a clip starting at `atF` so that it ends on a beat. The clip
 * is never changed by more than half its length, and stays within
 * [minF, maxF].
 * @param {number} atF
 * @param {number} lenF - Wanted length
 * @param {number[]} beatsF
 * @param {number} minF
 * @param {number} maxF - Most the source can give
 * @returns {number} The beat-aligned length, or `lenF` when no beat qualifies
 */
export function lengthOnBeat(atF, lenF, beatsF, minF, maxF) {
  if (!beatsF.length) return lenF;
  const target = atF + lenF;
  const near = nearestIndex(beatsF, target);
  let best = null;
  for (const i of [near, near - 1, near + 1]) {
    const beat = beatsF[i];
    if (beat === undefined) continue;
    const length = beat - atF;
    if (length < minF || length > maxF || Math.abs(beat - target) > lenF / 2) continue;
    if (best === null || Math.abs(beat - target) < Math.abs(best - target)) best = beat;
  }
  return best === null ? lenF : best - atF;
}
