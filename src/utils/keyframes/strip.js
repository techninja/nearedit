/**
 * Layout of the inspector's keyframe strip: one row per animated property
 * of a clip, its keys placed along a time range, plus the conversions
 * between pixels and time that clicking and dragging need. Pure and
 * isomorphic.
 * @module utils/keyframes/strip
 */

import { animatedPaths, listKeyframes } from '#utils/edl/keyframeQuery.js';
import { EPS } from '#utils/edl/time.js';

/**
 * @typedef {Object} StripKey
 * @property {string} id - Stable while the key does not move
 * @property {string} path
 * @property {number} time - Timeline seconds
 * @property {number} at - 0..1 along the strip's range
 * @property {string} ease
 * @property {number|string} v
 */

/**
 * @typedef {Object} StripRow
 * @property {string} path
 * @property {string} label
 * @property {StripKey[]} keys - Those inside the range, in time order
 * @property {number} outside - Keys the range does not show
 */

/** @typedef {{ start: number, end: number }} StripRange */

/**
 * Identity of a key for selection: its property and its timeline time.
 * @param {string} path
 * @param {number} time
 * @returns {string}
 */
export const keyId = (path, time) => `${path}@${time.toFixed(4)}`;

/**
 * The time range the strip shows: the whole clip, or — to work on keys
 * that sit close together in a long clip — just the span of its keys with
 * a margin.
 * @param {any} clip
 * @param {'clip'|'keys'} [fit='clip']
 * @returns {StripRange}
 */
export function stripRange(clip, fit = 'clip') {
  const whole = { start: clip.timelineStart, end: clip.timelineEnd };
  if (fit !== 'keys') return whole;
  const times = listKeyframes(clip)
    .filter((key) => key.inside)
    .map((key) => key.time);
  if (times.length < 2) return whole;
  const first = Math.min(...times);
  const last = Math.max(...times);
  const margin = Math.max((last - first) * 0.15, 0.25);
  return {
    start: Math.max(whole.start, first - margin),
    end: Math.min(whole.end, last + margin),
  };
}

/**
 * @param {StripRange} range
 * @param {number} time
 * @returns {number} 0..1 along the range (outside it for times outside)
 */
export function fractionAt(range, time) {
  const length = range.end - range.start;
  return length > 0 ? (time - range.start) / length : 0;
}

/**
 * @param {StripRange} range
 * @param {number} fraction - 0..1, clamped
 * @returns {number} Timeline seconds
 */
export function timeAt(range, fraction) {
  return range.start + Math.min(1, Math.max(0, fraction)) * (range.end - range.start);
}

/**
 * The rows of the strip.
 * @param {any} clip
 * @param {StripRange} range
 * @param {(clip: any, path: string) => string} labelOf
 * @returns {StripRow[]} In the order the properties were animated
 */
export function stripRows(clip, range, labelOf) {
  return animatedPaths(clip).map((path) => {
    const all = listKeyframes(clip, path);
    const keys = all
      .filter((key) => key.time >= range.start - EPS && key.time <= range.end + EPS)
      .map((key) => ({
        id: keyId(path, key.time),
        path,
        time: key.time,
        at: fractionAt(range, key.time),
        ease: key.ease || 'linear',
        v: key.v,
      }));
    return { path, label: labelOf(clip, path), keys, outside: all.length - keys.length };
  });
}

/**
 * Keep a move of keys inside their clip: whole frames, and never so far
 * that the first or the last moved key would leave it.
 * @param {number} delta - Wanted move, seconds
 * @param {{ fps: number, times: number[], clip: { timelineStart: number, timelineEnd: number } }} move -
 *   `times`: timeline times of the keys being moved
 * @returns {number} Seconds
 */
export function clampDelta(delta, { fps, times, clip }) {
  if (!times.length) return 0;
  const rate = fps > 0 ? fps : 30;
  const low = clip.timelineStart - Math.min(...times);
  const high = clip.timelineEnd - Math.max(...times);
  const frames = Math.round(Math.min(high, Math.max(low, delta)) * rate);
  // Rounding may push a key just past the clip's edge: step back inside.
  if (frames / rate > high + EPS) return (frames - 1) / rate;
  return frames / rate < low - EPS ? (frames + 1) / rate : frames / rate;
}

/**
 * How far a drag moves keys in time.
 * @param {StripRange} range - The range the strip shows
 * @param {number} dx - Pixels dragged
 * @param {number} width - Width of the strip's track in pixels
 * @param {Parameters<typeof clampDelta>[1]} move
 * @returns {number} Seconds
 */
export function dragDelta(range, dx, width, move) {
  if (!(width > 0)) return 0;
  return clampDelta((dx / width) * (range.end - range.start), move);
}
