/**
 * Fade curves — the shape of a clip's fade-in and fade-out
 * (`fadeInCurve`, `fadeOutCurve`). Each curve is one formula of progress
 * through the fade, `p` from 0 (the fade starts) to 1 (it ends):
 *
 * | curve    | level of a fade-in at progress p | FFmpeg `afade` in / out |
 * | -------- | -------------------------------- | ----------------------- |
 * | `linear` | `p`                              | `tri` / `tri`           |
 * | `smooth` | `(1 − cos(π·p)) / 2`             | `hsin` / `hsin`         |
 * | `fast`   | `1 − (1 − p)²`                   | `ipar` / `qua`          |
 * | `slow`   | `p²`                             | `qua` / `ipar`          |
 * | `sharp`  | `acos(1 − 2·p) / π`              | `ihsin` / `ihsin`       |
 *
 * **A fade-out is the complement: its level is `1 − curve(p)`.** So `fast`
 * always means "most of the change happens early" — a fast fade-in rises
 * quickly, a fast fade-out drops quickly — and two clips cross-fading with
 * the same curve always sum to 1 (equal gain).
 *
 * The same numbers apply to picture opacity and to audio gain, in the
 * preview and in the render. FFmpeg's `afade` evaluates its curve on the
 * time *remaining* in a fade-out, which is why `fast` and `slow` swap names
 * in the last column. Isomorphic and pure.
 * @module utils/edl/fadeCurves
 */

const { acos, cos, PI } = Math;

/** @type {Record<string, (p: number) => number>} */
const RISE = {
  linear: (p) => p,
  smooth: (p) => (1 - cos(PI * p)) / 2,
  fast: (p) => 1 - (1 - p) * (1 - p),
  slow: (p) => p * p,
  sharp: (p) => acos(1 - 2 * p) / PI,
};

/**
 * `1 − curve(1 − u)` written as a curve of `u`: `fast` and `slow` trade
 * places, the symmetric curves map to themselves. Evaluating a fade-out
 * this way keeps a linear fade free of rounding noise.
 * @type {Record<string, string>}
 */
const MIRROR = { linear: 'linear', smooth: 'smooth', fast: 'slow', slow: 'fast', sharp: 'sharp' };

/** @type {(name: string|undefined) => string} Unknown names are linear. */
const known = (name) => (name && Object.hasOwn(RISE, name) ? name : 'linear');
/** @type {(p: number) => number} */
const clamp01 = (p) => Math.max(0, Math.min(1, p));

/**
 * Level of a fade-in at a point of its progress.
 * @param {string|undefined} curve - A `FADE_CURVES` name; unknown = linear
 * @param {number} p - Progress through the fade, clamped to 0..1
 * @returns {number} 0 (silent / transparent) to 1 (full)
 */
export function fadeInLevel(curve, p) {
  return RISE[known(curve)](clamp01(p));
}

/**
 * Level of a fade-out: `1 − fadeInLevel(curve, p)`.
 * @param {string|undefined} curve - A `FADE_CURVES` name; unknown = linear
 * @param {number} p - Progress through the fade, clamped to 0..1
 * @returns {number} 1 (full) down to 0 (silent / transparent)
 */
export function fadeOutLevel(curve, p) {
  return fadeOutRemaining(curve, 1 - p);
}

/**
 * Level of a fade-out given the share of the fade still to come — the form
 * the levels are computed in (`remaining = (timelineEnd − time) / fadeOut`).
 * @param {string|undefined} curve
 * @param {number} remaining - 1 at the start of the fade, 0 at its end
 * @returns {number}
 */
export function fadeOutRemaining(curve, remaining) {
  return RISE[MIRROR[known(curve)]](clamp01(remaining));
}
