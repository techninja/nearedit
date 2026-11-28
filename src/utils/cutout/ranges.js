/**
 * What a timeline needs cut out: for every media file that a clip with
 * cutout on plays, the stretch of it those clips use — one cutout file per
 * media file, with room to trim. Isomorphic and pure.
 * Contract: docs/app-spec/CUTOUT.md § The cutout file, "Range".
 * @module utils/cutout/ranges
 */

import { clipKind } from '#utils/edl/clipKind.js';
import { hasCutout } from './fields.js';
import { frameRange } from './time.js';

/** @typedef {import('./types.js').CutoutRange} CutoutRange */

/** Seconds made on each side of what the clips use, so a small trim needs no new cutout. */
export const CUTOUT_MARGIN = 1;

/** The longest stretch one cutout file may hold, seconds: half an hour. */
export const CUTOUT_MAX_SECONDS = 30 * 60;

/**
 * @param {any} clip
 * @param {any} track
 * @returns {boolean} True for a clip that plays a video file through its matte
 */
export function isCutoutClip(clip, track) {
  if (!hasCutout(clip) || typeof clip.sourceFile !== 'string' || !clip.sourceFile) return false;
  if (!(Number(clip.sourceOut) > Number(clip.sourceIn))) return false;
  return clipKind(clip, track) === 'video';
}

/**
 * The stretch of each media file a document's cutout clips use: from the
 * earliest `sourceIn` to the latest `sourceOut` over all of them, a second
 * of margin on each side, not before the start of the file, on the frame
 * grid of the document. Clips on muted tracks count too — muting a track
 * does not make its cutouts out of date — and so does a clip the render
 * would skip for another reason. A still, a title, a generator or sound
 * has no cutout.
 * @param {{ fps?: number, tracks?: any[] } | null | undefined} edl
 * @returns {CutoutRange[]} One per media file, in order of first appearance
 */
export function cutoutRanges(edl) {
  /** @type {Map<string, { first: number, last: number, clips: string[] }>} */
  const used = new Map();
  for (const track of Array.isArray(edl?.tracks) ? edl.tracks : []) {
    for (const clip of Array.isArray(track?.clips) ? track.clips : []) {
      if (!clip || !isCutoutClip(clip, track)) continue;
      const span = used.get(clip.sourceFile) || { first: Infinity, last: -Infinity, clips: [] };
      // A window before the file's start plays nothing there: the file begins at 0.
      span.first = Math.min(span.first, Math.max(0, Number(clip.sourceIn)));
      span.last = Math.max(span.last, Number(clip.sourceOut));
      if (typeof clip.clipId === 'string') span.clips.push(clip.clipId);
      used.set(clip.sourceFile, span);
    }
  }
  return [...used].map(([path, { first, last, clips }]) => {
    const from = Math.max(0, first - CUTOUT_MARGIN);
    const { start, end, fps, frames } = frameRange(from, last + CUTOUT_MARGIN, edl.fps);
    return { path, start, end, fps, frames, clips };
  });
}
