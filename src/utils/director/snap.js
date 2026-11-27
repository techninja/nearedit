/**
 * Frame maths and nearest-candidate snapping shared by the director.
 * Isomorphic and pure.
 * @module utils/director/snap
 */

/** Guards frame rounding against float fuzz such as 0.1 * 30 = 3.0000000000000004. */
const EPS = 1e-6;

/**
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Nearest whole frame.
 * @param {number} time - Seconds
 * @param {number} [fps=30]
 * @returns {number} Frame count
 */
export function toFrames(time, fps = 30) {
  return Math.round(time * fps);
}

/**
 * Last whole frame at or before a time.
 * @param {number} time
 * @param {number} [fps=30]
 * @returns {number}
 */
export function floorFrames(time, fps = 30) {
  return Math.floor(time * fps + EPS);
}

/**
 * First whole frame at or after a time.
 * @param {number} time
 * @param {number} [fps=30]
 * @returns {number}
 */
export function ceilFrames(time, fps = 30) {
  return Math.ceil(time * fps - EPS);
}

/**
 * @param {number} frames
 * @param {number} [fps=30]
 * @returns {number} Seconds
 */
export function fromFrames(frames, fps = 30) {
  return frames / fps;
}

/**
 * Index of the value closest to `target` in an ascending array.
 * @param {number[]} sorted
 * @param {number} target
 * @returns {number} -1 when the array is empty
 */
export function nearestIndex(sorted, target) {
  if (!sorted.length) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && target - sorted[lo - 1] <= sorted[lo] - target) return lo - 1;
  return lo;
}

/**
 * The candidate closest to `target`, when one lies within `tolerance`.
 * @param {number} target
 * @param {number[]} sorted - Ascending candidates
 * @param {number} [tolerance=Infinity]
 * @returns {number} The snapped value, or `target` unchanged
 */
export function snapNear(target, sorted, tolerance = Infinity) {
  const i = nearestIndex(sorted, target);
  if (i < 0) return target;
  return Math.abs(sorted[i] - target) <= tolerance ? sorted[i] : target;
}

/**
 * Round to millisecond precision (keeps summaries and plans readable).
 * @param {number} value
 * @returns {number}
 */
export function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Human-readable seconds: "58.4s" or "2m 05s".
 * @param {number} seconds
 * @returns {string}
 */
export function formatSeconds(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}
