/**
 * Splitting a render into segments, and choosing each segment's renderer.
 *
 * Every clip is its own FFmpeg input, and every open input holds decoder
 * buffers and a waiting frame (tens of megabytes at HD), so one graph for a
 * whole film does not fit in memory. The picture is therefore rendered in
 * consecutive segments that each touch only a few clips, and joined without
 * re-encoding. A segment in which anything needs the compositor is drawn by
 * the canvas path, every other one by the filter graph (`route.js`); long
 * canvas segments are cut into chunks so several can be drawn at once. Pure.
 * @module api/render/segments
 */

import { activeTracks } from '#utils/edl/query.js';
import { createContext } from './context.js';
import { checkEngine, clipNeeds, documentNeeds, engineChoice, trackNeeds } from './route.js';
import { chunked, grouped } from './segmentRules.js';
import { clipWindow } from './timing.js';

/** Most layers one segment should touch (a soft limit). */
export const MAX_LAYERS = 8;
/** Segments are never cut shorter than this, so every one encodes alike. */
export const MIN_SEGMENT_FRAMES = 30;
/** Longest canvas segment, in keyframe intervals (2 s each): 4 s. */
export const CHUNK_GOPS = 2;

/**
 * @typedef {Object} Segment
 * @property {number} start - First frame
 * @property {number} end - One past the last frame
 * @property {import('./route.js').Engine} engine
 * @property {string[]} reasons - Why it needs the compositor (`route.js` codes); empty for `ffmpeg`
 */

/**
 * Every clip of the visible video tracks as a span of frames, with what it
 * needs from the compositor.
 * @param {any[]} tracks - Snapped tracks
 * @param {import('./timing.js').Timing} timing
 * @returns {{ first: number, last: number, needs: string[] }[]}
 */
function clipSpans(tracks, timing) {
  const spans = [];
  for (const track of activeTracks(tracks, 'video')) {
    const always = trackNeeds(track);
    for (const clip of track.clips) {
      const window = clipWindow(clip, timing);
      if (!window) continue;
      const needs = [...clipNeeds(clip, track), ...always];
      spans.push({ first: window.first, last: window.last, needs });
    }
  }
  return spans;
}

/**
 * Cut the rendered range into segments at clip boundaries so that each
 * touches at most `maxLayers` video-track clips where that is possible, and
 * so that stretches of plain footage stay apart from stretches that need the
 * compositor.
 * @param {any[]} tracks - Snapped tracks
 * @param {import('./timing.js').Timing} timing
 * @param {{ maxLayers?: number, minFrames?: number, chunkFrames?: number,
 *   everywhere?: string[] }} [limits] - `everywhere`: reasons that hold for the
 *   whole document; `chunkFrames`: longest canvas segment (default 4 s)
 * @returns {Segment[]} In order, covering the range
 */
export function planSegments(tracks, timing, limits = {}) {
  const { maxLayers = MAX_LAYERS, minFrames = MIN_SEGMENT_FRAMES, everywhere = [] } = limits;
  const gop = Math.max(1, Math.round(timing.fps * 2));
  const chunkFrames = limits.chunkFrames || gop * CHUNK_GOPS;
  const spans = clipSpans(tracks, timing);
  const edges = spans.flatMap((span) => [span.first, span.last]);
  const cuts = [...new Set([timing.startFrame, timing.endFrame, ...edges])].sort((a, b) => a - b);
  const touching = (from, to) => spans.filter((s) => s.first < to && s.last > from);
  const pieces = cuts.slice(1).map((end, i) => {
    const needs = touching(cuts[i], end).flatMap((span) => span.needs);
    return { start: cuts[i], end, needs: [...new Set([...everywhere, ...needs])] };
  });
  const fits = (from, to) => touching(from, to).length <= maxLayers;
  return grouped(pieces, { minFrames, fits }).flatMap((segment) =>
    segment.engine === 'canvas' ? chunked(segment, chunkFrames, minFrames) : [segment],
  );
}

/**
 * Segments of an EDL render as ranges in seconds, each with its renderer.
 * @param {{ fps?: number, tracks?: any[], background?: string }} edl
 * @param {import('./context.js').PlanOptions & { maxLayers?: number, minFrames?: number,
 *   chunkFrames?: number }} [options]
 * @returns {{ start: number, end: number, frames: number, engine: import('./route.js').Engine,
 *   reasons: string[] }[]}
 * @throws {import('./errors.js').RenderError} 422 when `RENDER_ENGINE=ffmpeg`
 *   and the range needs the compositor
 */
export function renderSegments(edl, options = {}) {
  const { tracks, timing } = createContext(edl, options);
  const choice = options.engine || engineChoice();
  const everywhere = documentNeeds(edl, choice);
  const segments = planSegments(tracks, timing, { ...options, everywhere });
  checkEngine(
    segments.flatMap((segment) => segment.reasons),
    choice,
  );
  return segments.map(({ start, end, engine, reasons }) => ({
    start: start / timing.fps,
    end: end / timing.fps,
    frames: end - start,
    engine,
    reasons,
  }));
}
