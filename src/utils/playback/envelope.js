/**
 * Gain envelopes — turn a clip's fades into a schedule of Web Audio
 * automation events. Values come from `clipGain` (levels.js), the same
 * function the FFmpeg renderer uses, so preview and render fade alike.
 * Pure and isomorphic.
 * @module utils/playback/envelope
 */

import { clipGain } from '#utils/edl/levels.js';

/**
 * @typedef {{ time: number, value: number }} GainPoint
 * @typedef {{ type: 'set'|'ramp', time: number, value: number }} GainEvent
 */

/**
 * Breakpoints of a clip's gain over its life, in timeline seconds. Gain is
 * linear between neighbouring points (fades are linear ramps; an audio
 * cross-fade is two of them, one per clip — equal-gain).
 * @param {{ volume?: number }} track
 * @param {any} clip
 * @returns {GainPoint[]} Sorted by time, first at timelineStart, last at timelineEnd
 */
export function gainPoints(track, clip) {
  const { timelineStart: start, timelineEnd: end } = clip;
  const fadeIn = Math.max(0, clip.fadeIn || 0);
  const fadeOut = Math.max(0, clip.fadeOut || 0);
  const times = [start, start + fadeIn, end - fadeOut, end];
  // Fades that overlap (a broken document) meet where the two ramps cross.
  if (fadeIn + fadeOut > end - start) {
    times.push((start * fadeOut + end * fadeIn) / (fadeIn + fadeOut));
  }
  const unique = [...new Set(times.filter((t) => t >= start && t <= end))].sort((a, b) => a - b);
  return unique.map((time) => ({ time, value: clipGain(track, clip, time) }));
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
