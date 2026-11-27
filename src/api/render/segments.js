/**
 * Splitting a long render into segments. Every clip is its own FFmpeg
 * input, and every open input holds decoder buffers and a waiting frame
 * (tens of megabytes at HD), so one graph for a whole film does not fit in
 * memory. The picture is therefore rendered in consecutive segments that
 * each touch only a few clips, and joined without re-encoding. Pure.
 * @module api/render/segments
 */

import { activeTracks } from '#utils/edl/query.js';
import { createContext } from './context.js';
import { clipWindow } from './timing.js';

/** Most layers one segment should touch (a soft limit). */
export const MAX_LAYERS = 8;
/** Segments are never cut shorter than this, so every one encodes alike. */
export const MIN_SEGMENT_FRAMES = 30;

/**
 * Cut the rendered range into segments at clip boundaries so that each
 * touches at most `maxLayers` video-track clips where that is possible.
 * @param {any[]} tracks - Snapped tracks
 * @param {import('./timing.js').Timing} timing
 * @param {{ maxLayers?: number, minFrames?: number }} [limits]
 * @returns {{ start: number, end: number }[]} Frame ranges, in order, covering the range
 */
export function planSegments(tracks, timing, limits = {}) {
  const { maxLayers = MAX_LAYERS, minFrames = MIN_SEGMENT_FRAMES } = limits;
  const spans = activeTracks(tracks, 'video')
    .flatMap((track) => track.clips.map((clip) => clipWindow(clip, timing)))
    .filter(Boolean);
  const edges = spans.flatMap((span) => [span.first, span.last]);
  const cuts = [...new Set([timing.startFrame, timing.endFrame, ...edges])].sort((a, b) => a - b);
  const touching = (from, to) => spans.filter((s) => s.first < to && s.last > from).length;

  const segments = [];
  let start = cuts[0];
  for (let i = 1; i < cuts.length - 1; i++) {
    // Close the segment here if taking in the next stretch would exceed the budget.
    if (cuts[i] - start < minFrames || touching(start, cuts[i + 1]) <= maxLayers) continue;
    segments.push({ start, end: cuts[i] });
    start = cuts[i];
  }
  segments.push({ start, end: cuts[cuts.length - 1] });
  const last = segments[segments.length - 1];
  if (segments.length > 1 && last.end - last.start < minFrames) {
    segments.pop();
    segments[segments.length - 1].end = last.end;
  }
  return segments;
}

/**
 * Segments of an EDL render as ranges in seconds.
 * @param {{ fps?: number, tracks?: any[] }} edl
 * @param {import('./context.js').PlanOptions & { maxLayers?: number }} [options]
 * @returns {{ start: number, end: number, frames: number }[]}
 */
export function renderSegments(edl, options = {}) {
  const { tracks, timing } = createContext(edl, options);
  return planSegments(tracks, timing, options).map(({ start, end }) => ({
    start: start / timing.fps,
    end: end / timing.fps,
    frames: end - start,
  }));
}
