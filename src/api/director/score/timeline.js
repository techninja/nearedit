/**
 * Reading the timeline a score is written for: the span to score — the
 * whole timeline, the selected clips or `context.range` — its turning
 * points (markers and regions first, then the starts of titles and
 * generated scenes, then long shots) and its pace in cuts per minute.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The timeline.
 * @module api/director/score/timeline
 */

import { clipKind } from '#utils/edl/factory.js';
import { snapToFrame, timelineDuration } from '#utils/edl/query.js';
import { DirectorError } from '../errors.js';
import { typedTracks } from '../result.js';

/**
 * @typedef {{ start: number, end: number, seconds: number, what: string }} Span - Timeline
 *   seconds on the frame grid; `what`: the span in words
 * @typedef {import('#utils/director/score/sections.js').TurningPoint} TurningPoint
 */

/** The shortest span worth scoring, seconds. */
export const MIN_SPAN = 1;
/** A shot at least this long begins something new; shorter ones are a montage. */
const LONG_SHOT = 4;
/** Turning points closer to either end of the span than this change nothing. */
const EDGE = 0.5;

/**
 * The span to score: `context.range` in range mode, else from the first to
 * the last selected clip, else the whole timeline.
 * @param {any} edl - The posted document
 * @param {import('#utils/director/directive.js').Directive} directive
 * @param {number} fps
 * @returns {Span}
 * @throws {DirectorError} 422 when there is nothing to score
 */
export function scoreSpan(edl, directive, fps) {
  const { range, selection } = directive.context;
  let [start, end, what] = [0, timelineDuration(edl || []), 'the whole timeline'];
  const chosen = (edl?.tracks || [])
    .flatMap((/** @type {any} */ track) => track.clips || [])
    .filter((/** @type {any} */ clip) => selection.includes(clip.clipId));
  if (directive.mode === 'range' && range)
    [start, end, what] = [range.start, range.end, 'the range'];
  else if (chosen.length) {
    start = Math.min(...chosen.map((/** @type {any} */ clip) => clip.timelineStart));
    end = Math.max(...chosen.map((/** @type {any} */ clip) => clip.timelineEnd));
    what = chosen.length === 1 ? 'the selected clip' : `the ${chosen.length} selected clips`;
  }
  const span = { start: snapToFrame(Math.max(0, start), fps), end: snapToFrame(end, fps) };
  if (!(span.end - span.start >= MIN_SPAN)) {
    const empty = !(timelineDuration(edl || []) > 0);
    throw new DirectorError(
      empty ? 'There is nothing on the timeline to score' : 'That is too short to score',
      {
        status: 422,
        fields: {
          edl: empty
            ? 'Put something on the timeline first, or choose a range to write music for'
            : `Music needs at least ${MIN_SPAN} second: choose a longer range or more clips`,
        },
      },
    );
  }
  return { ...span, seconds: span.end - span.start, what };
}

/**
 * The picture of the timeline: every clip on a video track that is shown.
 * @param {any} edl
 * @param {Span} span
 * @returns {{ clip: any, kind: string }[]} Those that begin inside the span
 */
function shown(edl, span) {
  return typedTracks(edl)
    .filter(({ track, type }) => type === 'video' && !track.muted)
    .flatMap(({ track }) =>
      (track.clips || []).map((/** @type {any} */ clip) => ({ clip, kind: clipKind(clip, track) })),
    )
    .filter(({ clip }) => clip.timelineStart >= span.start && clip.timelineStart < span.end);
}

/**
 * The moments at which the timeline turns, in seconds from the start of
 * the span: where the music should change.
 * @param {any} edl
 * @param {Span} span
 * @returns {TurningPoint[]} In order of time; where several fall together, the weightiest one
 */
export function turningPoints(edl, span) {
  /** @type {TurningPoint[]} */
  const all = [];
  const add = (/** @type {number} */ at, /** @type {string} */ kind, label = '') => {
    const time = Math.round((at - span.start) * 1000) / 1000;
    const weight = { marker: 3, region: 3, title: 2, scene: 2, shot: 1 }[kind];
    if (time > EDGE && time < span.seconds - EDGE) all.push({ time, weight, kind, label });
  };
  const words = (/** @type {any} */ text) =>
    String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  for (const marker of edl?.markers || []) {
    if (Number.isFinite(marker?.time)) add(marker.time, 'marker', words(marker.label));
  }
  for (const region of edl?.regions || []) {
    if (Number.isFinite(region?.start)) add(region.start, 'region', words(region.label));
  }
  for (const { clip, kind } of shown(edl, span)) {
    const length = clip.timelineEnd - clip.timelineStart;
    if (kind === 'title') add(clip.timelineStart, 'title', words(clip.text?.content));
    else if (kind === 'generator') add(clip.timelineStart, 'scene', words(clip.label));
    else if (kind !== 'placeholder' && length >= LONG_SHOT) add(clip.timelineStart, 'shot');
  }
  /** @type {TurningPoint[]} */
  const kept = [];
  for (const point of all.sort((a, b) => b.weight - a.weight || a.time - b.time)) {
    if (kept.every((other) => Math.abs(other.time - point.time) > 0.1)) kept.push(point);
  }
  return kept.sort((a, b) => a.time - b.time);
}

/**
 * How fast the picture is cut.
 * @param {any} edl
 * @param {Span} span
 * @returns {number} Cuts per minute: the moments inside the span at which a
 *   shot begins — footage, stills and generated scenes; titles are not cuts
 */
export function cutsPerMinute(edl, span) {
  const starts = shown(edl, span)
    .filter(({ kind }) => kind !== 'title' && kind !== 'placeholder')
    .map(({ clip }) => Math.round(clip.timelineStart * 100))
    .filter((at) => at > Math.round(span.start * 100));
  return (new Set(starts).size * 60) / span.seconds;
}
