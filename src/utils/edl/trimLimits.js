/**
 * How far a clip edge may be trimmed: source bounds, the one-frame minimum
 * and the cross-fades the clip is part of. Isomorphic and pure.
 * @module utils/edl/trimLimits
 */

import { NO_OVERLAP, neighbourOverlaps } from './fades.js';
import { isTimed } from './immutable.js';
import { clamp, floorToFrame, frameDuration, sourceDurationOf } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * Allowed change of one clip's edge, in seconds.
 * - `sourceIn` never goes below 0, `sourceOut` never passes a known source
 *   duration (video/audio only — images, titles and placeholders are free).
 * - The clip keeps at least one frame, and stays longer than the cross-fade
 *   on its other edge so a trim can never tuck it inside its neighbour.
 * - A ripple trim keeps both cross-fades intact.
 * @param {Edl} edl
 * @param {ClipRef} ref
 * @param {'start'|'end'} edge
 * @param {{ ripple?: boolean, sourceDurations?: import('./types.js').SourceDurations }} opts
 * @returns {[number, number]} [min, max] delta for that edge
 */
export function trimRange(edl, { clip, track }, edge, opts) {
  const frame = frameDuration(edl);
  const timed = isTimed(clip, track);
  const overlap = neighbourOverlaps(track.clips).get(clip.clipId) || NO_OVERLAP;
  const duration = clip.timelineEnd - clip.timelineStart;
  const kept = edge === 'start' ? overlap.out : overlap.in;
  const room = opts.ripple ? Math.max(frame, overlap.in + overlap.out) : frame + kept;
  if (edge === 'start') {
    let min = opts.ripple ? -Infinity : -clip.timelineStart;
    if (timed) min = Math.max(min, -floorToFrame(edl, clip.sourceIn));
    return [min, duration - room];
  }
  const known = timed ? sourceDurationOf(opts.sourceDurations, clip.sourceFile) : undefined;
  const max = known === undefined ? Infinity : floorToFrame(edl, known - clip.sourceOut);
  return [room - duration, max];
}

/**
 * Clamp a trim delta so that every clip being trimmed stays valid.
 * @param {Edl} edl
 * @param {ClipRef[]} targets - The clip and its linked partner
 * @param {'start'|'end'} edge
 * @param {number} delta
 * @param {{ ripple?: boolean, sourceDurations?: import('./types.js').SourceDurations }} opts
 * @returns {number}
 */
export function limitTrim(edl, targets, edge, delta, opts) {
  let min = -Infinity;
  let max = Infinity;
  for (const ref of targets) {
    const [low, high] = trimRange(edl, ref, edge, opts);
    min = Math.max(min, low);
    max = Math.min(max, high);
  }
  return clamp(delta, Math.min(min, 0), Math.max(max, 0));
}
