/**
 * Render timing — everything is counted in whole output frames (video) and
 * whole samples (audio) so layers, fades and audio stay in exact sync.
 * Pure.
 * @module api/render/timing
 */

import { timelineDuration, sourceTimeAt } from '#utils/edl/query.js';
import { clipKind } from '#utils/edl/factory.js';

export const SAMPLE_RATE = 48000;

const NTSC = [23.976, 29.97, 59.94, 119.88];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @typedef {Object} Timing
 * @property {number} fps - Frames per second as a number
 * @property {string} fpsText - Exact rational for FFmpeg, e.g. "30000/1001"
 * @property {number} totalFrames - Length of the whole timeline
 * @property {number} startFrame - First rendered timeline frame
 * @property {number} endFrame - One past the last rendered timeline frame
 * @property {number} frames - Rendered frame count
 * @property {number} duration - Rendered seconds
 * @property {number} samples - Rendered audio samples
 */

/**
 * Express an EDL frame rate as an exact rational.
 * @param {unknown} value
 * @returns {{ fps: number, fpsText: string }}
 */
export function fpsRational(value) {
  const raw = clamp(Number(value) || 30, 1, 240);
  const ntsc = NTSC.find((rate) => Math.abs(rate - raw) < 0.011);
  if (ntsc) {
    const numerator = Math.round(ntsc) * 1000;
    return { fps: numerator / 1001, fpsText: `${numerator}/1001` };
  }
  if (Math.abs(raw - Math.round(raw)) < 1e-6)
    return { fps: Math.round(raw), fpsText: `${Math.round(raw)}` };
  const numerator = Math.round(raw * 1000);
  return { fps: numerator / 1000, fpsText: `${numerator}/1000` };
}

/**
 * Sample index of a frame boundary.
 * @param {number} frame
 * @param {number} fps
 * @returns {number}
 */
export function sampleAt(frame, fps) {
  return Math.round((frame * SAMPLE_RATE) / fps);
}

/**
 * Resolve what part of the timeline is rendered.
 * @param {{ fps?: number, tracks?: object[] }} edl
 * @param {{ start?: number, end?: number } | null} [range]
 * @returns {Timing}
 */
export function createTiming(edl, range) {
  const { fps, fpsText } = fpsRational(edl.fps);
  const totalFrames = Math.round(timelineDuration(edl) * fps);
  const frameOf = (seconds, fallback) =>
    Number.isFinite(seconds) ? clamp(Math.round(seconds * fps), 0, totalFrames) : fallback;
  const startFrame = range ? frameOf(Number(range.start), 0) : 0;
  const endFrame = range ? frameOf(Number(range.end), totalFrames) : totalFrames;
  const frames = Math.max(0, endFrame - startFrame);
  return {
    ...{ fps, fpsText, totalFrames, startFrame, endFrame, frames },
    duration: frames / fps,
    samples: sampleAt(endFrame, fps) - sampleAt(startFrame, fps),
  };
}

/**
 * Copy of a track whose clips sit exactly on frame boundaries, sorted by
 * start, with unrenderable clips (placeholders, zero length) removed. The
 * source offset moves with the snapped start so the picture stays in sync,
 * and fades are clamped to the clip (EDL invariant 3).
 * @param {{ type?: string, clips?: any[] }} track
 * @param {Timing} timing
 * @returns {any}
 */
export function snapTrack(track, timing) {
  const clips = [];
  for (const clip of track.clips || []) {
    if (!clip || clipKind(clip, track) === 'placeholder') continue;
    const startFrame = Math.max(0, Math.round(clip.timelineStart * timing.fps));
    const endFrame = Math.round(clip.timelineEnd * timing.fps);
    if (!(endFrame > startFrame)) continue;
    const timelineStart = startFrame / timing.fps;
    const length = (endFrame - startFrame) / timing.fps;
    const fadeIn = clamp(Number(clip.fadeIn) || 0, 0, length);
    clips.push({
      ...clip,
      ...{ startFrame, endFrame, timelineStart, fadeIn },
      timelineEnd: endFrame / timing.fps,
      sourceIn: Math.max(0, (Number(clip.sourceIn) || 0) + timelineStart - clip.timelineStart),
      fadeOut: clamp(Number(clip.fadeOut) || 0, 0, length - fadeIn),
    });
  }
  clips.sort((a, b) => a.startFrame - b.startFrame);
  return { ...track, clips };
}

/**
 * The part of a snapped clip that falls inside the rendered range.
 * @param {{ startFrame: number, endFrame: number, sourceIn: number, timelineStart: number }} clip
 * @param {Timing} timing
 * @returns {{ count: number, offset: number, shift: number, length: number, seek: number,
 *   first: number, last: number } | null} null when the clip is outside the range.
 *   `count` frames are shown starting `offset` frames into the clip; clip-local
 *   frame 0 sits at output frame `shift` (negative when the clip began earlier).
 */
export function clipWindow(clip, timing) {
  const first = Math.max(clip.startFrame, timing.startFrame);
  const last = Math.min(clip.endFrame, timing.endFrame);
  if (last <= first) return null;
  return {
    ...{ first, last },
    count: last - first,
    offset: first - clip.startFrame,
    shift: clip.startFrame - timing.startFrame,
    length: clip.endFrame - clip.startFrame,
    seek: Math.max(0, sourceTimeAt(clip, first / timing.fps)),
  };
}
