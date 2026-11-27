/**
 * Drift correction — keeps a free-running media element on the master
 * clock. Small errors are closed by nudging the playback rate (inaudible,
 * invisible); large ones by seeking. Pure and isomorphic.
 * @module utils/playback/drift
 */

/**
 * @typedef {Object} DriftLimits
 * @property {number} soft - Seconds of error tolerated before correcting
 * @property {number} hard - Seconds of error beyond which the element is re-seeked
 * @property {number} [maxNudge=0.05] - Largest playback-rate change, as a fraction
 */

/** Sound: 15 ms is under an echo, 100 ms is a missed cue. */
export const AUDIO_DRIFT = Object.freeze({ soft: 0.015, hard: 0.1, maxNudge: 0.05 });

/** Picture: half a 30 fps frame, and three frames. */
export const VIDEO_DRIFT = Object.freeze({ soft: 0.017, hard: 0.1, maxNudge: 0.1 });

/** Smallest nudge: a correction always closes at least 10 ms per second. */
const MIN_NUDGE = 0.01;

/** Once correcting, carry on until the error is a quarter of the tolerance. */
const RELEASE = 0.25;

/**
 * Decide how to correct an element that is `drift` seconds ahead of
 * (positive) or behind (negative) where the clock says it should be.
 * A correction that has started (`correcting`) continues until the error is
 * well inside the tolerance, so the rate does not flutter at the threshold.
 * @param {number} drift - element time − expected time, seconds
 * @param {DriftLimits} limits
 * @param {boolean} [correcting=false] - The element is already being nudged
 * @returns {{ seek: boolean, rate: number }} Re-seek, or play at `rate`
 */
export function correctDrift(drift, limits, correcting = false) {
  const error = Math.abs(drift);
  if (!Number.isFinite(drift) || error > limits.hard) return { seek: true, rate: 1 };
  if (error <= (correcting ? limits.soft * RELEASE : limits.soft)) return { seek: false, rate: 1 };
  // Proportional: close the gap in about a second, within [MIN_NUDGE, maxNudge].
  const nudge = Math.max(MIN_NUDGE, Math.min(limits.maxNudge ?? 0.05, error));
  return { seek: false, rate: 1 - Math.sign(drift) * nudge };
}
