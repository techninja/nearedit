/**
 * Time helpers shared by every EDL operation: the float tolerance, frame
 * snapping and source-duration lookups. Isomorphic and pure.
 * @module utils/edl/time
 */

import { snapToFrame } from './query.js';

/** @typedef {import('./types.js').SourceDurations} SourceDurations */

/** Float tolerance in seconds used by every time comparison in the library. */
export const EPS = 1e-6;

/**
 * @param {{ fps?: number }} edl
 * @returns {number} The document frame rate, 30 when missing or unusable
 */
export function fpsOf(edl) {
  return edl?.fps > 0 ? edl.fps : 30;
}

/**
 * @param {{ fps?: number }} edl
 * @returns {number} Seconds per frame
 */
export function frameDuration(edl) {
  return 1 / fpsOf(edl);
}

/**
 * Snap a time to the document's frame grid.
 * @param {{ fps?: number }} edl
 * @param {number} time
 * @returns {number}
 */
export function snap(edl, time) {
  return snapToFrame(time, fpsOf(edl));
}

/**
 * The last frame boundary that does not exceed `time`.
 * @param {{ fps?: number }} edl
 * @param {number} time
 * @returns {number}
 */
export function floorToFrame(edl, time) {
  const fps = fpsOf(edl);
  return Math.floor(time * fps + EPS) / fps;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {any} value
 * @param {number} fallback
 * @returns {number} `value` when it is a finite number, otherwise `fallback`
 */
export function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Look up the known duration of a source file.
 * @param {SourceDurations} [durations]
 * @param {string} [file]
 * @returns {number|undefined} Seconds, or undefined when unknown
 */
export function sourceDurationOf(durations, file) {
  if (!durations || !file) return undefined;
  const value = durations instanceof Map ? durations.get(file) : durations[file];
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
