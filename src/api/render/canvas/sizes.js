/**
 * The size footage is decoded at for the compositor. Handing the canvas a
 * 4K frame to draw into a quarter of an HD picture wastes the decode, the
 * copy and the memory, and lets a plain bilinear `drawImage` do a reduction
 * FFmpeg's scaler does better. So each clip is decoded at the largest size
 * it is ever shown at — never larger than the source, and the same for the
 * whole clip, whichever segment asks. Pure.
 * @module api/render/canvas/sizes
 */

import { resolveClip } from '#utils/edl/animate.js';
import { clipProgress, placeSource, resolveTransform } from '#utils/edl/geometry.js';

/** Moments sampled along a clip whose placement is animated. */
const SAMPLES = 240;
/** Smallest side worth decoding. */
const MIN_SIDE = 2;

/**
 * @param {any} clip
 * @returns {boolean} True when the clip's placement changes over time
 */
function moves(clip) {
  const keyed = Object.keys(clip.keyframes || {}).some((path) => path.startsWith('transform.'));
  return keyed || Boolean(clip.transform?.kenBurns?.enabled);
}

/**
 * Output pixels per source pixel at one moment: the larger of the two axes.
 * @param {any} clip - Snapped clip
 * @param {number} time - Timeline seconds
 * @param {{ width: number, height: number }} source - Displayed source size
 * @param {{ width: number, height: number }} frame - EDL resolution
 * @param {{ width: number, height: number }} out - Canvas size
 * @returns {number}
 */
function densityAt(clip, time, source, frame, out) {
  const resolved = resolveClip(clip, time);
  const t = resolveTransform(resolved, clipProgress(resolved, time));
  const p = placeSource(source.width, source.height, frame.width, frame.height, t);
  const kx = out.width / frame.width;
  const ky = out.height / frame.height;
  return Math.max(Math.abs(p.dw * kx) / p.sw, Math.abs(p.dh * ky) / p.sh);
}

/**
 * The size to decode a footage clip at.
 * @param {any} clip - Snapped clip
 * @param {{ width: number, height: number }} source - Displayed source size
 *   (rotation applied, pixels squared)
 * @param {{ width: number, height: number }} frame - EDL resolution
 * @param {{ width: number, height: number }} out - Canvas size
 * @returns {{ width: number, height: number }} The source's own size, or a
 *   reduction of it with the same proportions
 */
export function decodeSize(clip, source, frame, out) {
  const length = clip.timelineEnd - clip.timelineStart;
  const steps = moves(clip) ? SAMPLES : 0;
  let density = 0;
  for (let i = 0; i <= steps; i++) {
    const time = clip.timelineStart + (steps ? (length * i) / steps : 0);
    density = Math.max(density, densityAt(clip, time, source, frame, out));
  }
  if (!(density < 1)) return { width: source.width, height: source.height };
  const width = Math.max(MIN_SIDE, Math.min(source.width, Math.ceil(source.width * density)));
  // The height follows the width, so the picture keeps its proportions.
  const height = Math.max(MIN_SIDE, Math.round((width * source.height) / source.width));
  return { width, height };
}
