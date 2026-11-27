/**
 * Gain envelopes — turn a clip's level over time into a schedule of Web
 * Audio automation events. Every value comes from `clipGain` (levels.js) on
 * the clip as `resolveClip` gives it at that moment — the same two functions
 * the renderer uses — so fades, fade curves and a keyframed `volume` (a
 * volume envelope) are heard in the preview exactly as they render.
 * Pure and isomorphic.
 * @module utils/playback/envelope
 */

import { resolveClip } from '#utils/edl/animate.js';
import { clipGain } from '#utils/edl/levels.js';

/**
 * @typedef {{ time: number, value: number }} GainPoint
 * @typedef {{ type: 'set'|'ramp', time: number, value: number }} GainEvent
 */

/** A stretch is a straight ramp when the gain strays less than this from one. */
const TOLERANCE = 0.002;

/** Points are never placed closer together than this, seconds. */
const MIN_STEP = 0.004;

/**
 * The moments at which a clip's gain may change direction: its edges, the
 * ends of its fades, and the keys of a keyframed volume.
 * @param {any} clip
 * @returns {number[]} Timeline seconds within the clip, ascending, distinct
 */
function corners(clip) {
  const { timelineStart: start, timelineEnd: end } = clip;
  const fadeIn = Math.max(0, clip.fadeIn || 0);
  const fadeOut = Math.max(0, clip.fadeOut || 0);
  const times = [start, start + fadeIn, end - fadeOut, end];
  // Fades that overlap (a broken document) meet where the two ramps cross.
  if (fadeIn + fadeOut > end - start) {
    times.push((start * fadeOut + end * fadeIn) / (fadeIn + fadeOut));
  }
  for (const key of clip.keyframes?.volume || []) {
    times.push(start + key.t - (clip.sourceIn || 0));
  }
  return [...new Set(times.filter((t) => t >= start && t <= end))].sort((a, b) => a - b);
}

/**
 * Add points between two neighbours until straight ramps follow the gain:
 * none on a linear stretch, a few dozen along a curve, a tight pair around
 * a step.
 * @param {(time: number) => number} gain
 * @param {GainPoint} a
 * @param {GainPoint} b
 * @param {GainPoint[]} out - Receives the points strictly between `a` and `b`
 */
function refine(gain, a, b, out) {
  const span = b.time - a.time;
  if (span < MIN_STEP * 2) return;
  const middle = { time: a.time + span / 2, value: gain(a.time + span / 2) };
  const straight = [0.25, 0.5, 0.75].every((p) => {
    const value = p === 0.5 ? middle.value : gain(a.time + span * p);
    return Math.abs(value - (a.value + (b.value - a.value) * p)) <= TOLERANCE;
  });
  if (straight) return;
  refine(gain, a, middle, out);
  out.push(middle);
  refine(gain, middle, b, out);
}

/**
 * Breakpoints of a clip's gain over its life, in timeline seconds; gain is
 * linear between neighbours. Linear fades give just their corners (an audio
 * cross-fade is two ramps, one per clip — equal-gain); fade curves and
 * volume keyframes with easing are followed closely.
 * @param {{ volume?: number }} track
 * @param {any} clip - As stored in the document (keyframes not applied)
 * @returns {GainPoint[]} Sorted by time, first at timelineStart, last at timelineEnd
 */
export function gainPoints(track, clip) {
  const gain = (/** @type {number} */ time) => clipGain(track, resolveClip(clip, time), time);
  /** @type {GainPoint[]} */
  const points = [];
  for (const time of corners(clip)) {
    const point = { time, value: gain(time) };
    if (points.length) refine(gain, points[points.length - 1], point, points);
    points.push(point);
  }
  return points;
}

/**
 * Gain at a moment, interpolated between breakpoints; 0 outside the clip.
 * @param {GainPoint[]} points
 * @param {number} time - Timeline seconds
 * @returns {number}
 */
export function gainAt(points, time) {
  if (!points.length || time < points[0].time || time >= points[points.length - 1].time) return 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (time > b.time) continue;
    const span = b.time - a.time;
    return span > 0 ? a.value + ((b.value - a.value) * (time - a.time)) / span : b.value;
  }
  return 0;
}

/**
 * Automation events that play the rest of an envelope from `position`:
 * silence until the clip starts, a `set` to pick up the current level,
 * `ramp`s to every later breakpoint and a final `set` to 0 at the clip end.
 * Event times are timeline seconds, never earlier than `position`.
 * @param {GainPoint[]} points
 * @param {number} position - Timeline seconds the schedule starts from
 * @returns {GainEvent[]}
 */
export function gainEvents(points, position) {
  if (!points.length) return [{ type: 'set', time: position, value: 0 }];
  const start = points[0].time;
  const end = points[points.length - 1].time;
  if (position >= end) return [{ type: 'set', time: position, value: 0 }];
  /** @type {GainEvent[]} */
  const events = [];
  if (position < start) {
    events.push({ type: 'set', time: position, value: 0 });
    events.push({ type: 'set', time: start, value: points[0].value });
  } else {
    events.push({ type: 'set', time: position, value: gainAt(points, position) });
  }
  const from = Math.max(position, start);
  for (const point of points) {
    if (point.time > from) events.push({ type: 'ramp', time: point.time, value: point.value });
  }
  events.push({ type: 'set', time: end, value: 0 });
  return events;
}
