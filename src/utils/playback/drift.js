/**
 * Drift correction — keeps a free-running media element on the master
 * clock. Small errors are closed by nudging the playback rate (inaudible,
 * invisible); large ones by seeking. Pure and isomorphic.
 * @module utils/playback/drift
 */

/**
 * @typedef {Object} DriftLimits
 * @property {number} soft - Seconds of error tolerated without any correction
 * @property {number} hard - Seconds of error beyond which the element is re-seeked
 * @property {number} [maxNudge=0.06] - Largest playback-rate change, as a fraction
 */

/** Sound: 15 ms is under an echo, 100 ms is a missed cue. */
export const AUDIO_DRIFT = Object.freeze({ soft: 0.015, hard: 0.1, maxNudge: 0.05 });

/** Picture: half a 30 fps frame, and three frames. */
export const VIDEO_DRIFT = Object.freeze({ soft: 0.017, hard: 0.1, maxNudge: 0.1 });

/**
 * Decide how to correct an element that is `drift` seconds ahead of
 * (positive) or behind (negative) where the clock says it should be.
 * @param {number} drift - element time − expected time, seconds
 * @param {DriftLimits} limits
 * @returns {{ seek: boolean, rate: number }} Re-seek, or play at `rate`
 */
export function correctDrift(drift, limits) {
  const error = Math.abs(drift);
  if (!Number.isFinite(drift) || error > limits.hard) return { seek: true, rate: 1 };
  if (error <= limits.soft) return { seek: false, rate: 1 };
  const maxNudge = limits.maxNudge ?? 0.06;
  // Proportional: close the gap in about a second, never faster than maxNudge.
  const nudge = Math.max(-maxNudge, Math.min(maxNudge, -drift));
  return { seek: false, rate: 1 + nudge };
}
