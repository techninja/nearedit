/**
 * Easing curves for keyframes and for generator animations (text in/out,
 * particle life curves). Each maps progress 0..1 to eased progress; the
 * overshooting ones may leave 0..1 on purpose. Isomorphic and pure.
 * @module utils/edl/easing
 */

const { cos, sin, pow, PI } = Math;

/** @param {number} p @returns {number} */
function bounceOut(p) {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p - 1.5 / d) ** 2 + 0.75;
  if (p < 2.5 / d) return n * (p - 2.25 / d) ** 2 + 0.9375;
  return n * (p - 2.625 / d) ** 2 + 0.984375;
}

/** @type {Record<string, (p: number) => number>} */
const CURVES = {
  linear: (p) => p,
  hold: (p) => (p < 1 ? 0 : 1),
  'ease-in': (p) => p * p * p,
  'ease-out': (p) => 1 - pow(1 - p, 3),
  'ease-in-out': (p) => (p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2),
  'back-in': (p) => 2.70158 * p * p * p - 1.70158 * p * p,
  'back-out': (p) => 1 + 2.70158 * pow(p - 1, 3) + 1.70158 * pow(p - 1, 2),
  'elastic-out': (p) =>
    p === 0 || p === 1 ? p : pow(2, -10 * p) * sin((p * 10 - 0.75) * ((2 * PI) / 3)) + 1,
  'bounce-out': bounceOut,
  sine: (p) => (1 - cos(PI * p)) / 2,
};

/** Names accepted wherever an easing is chosen. */
export const EASINGS = Object.keys(CURVES);

/**
 * Apply a named easing. Unknown names fall back to linear; progress is
 * clamped to 0..1 first.
 * @param {string|undefined} name
 * @param {number} p
 * @returns {number}
 */
export function ease(name, p) {
  const clamped = Math.max(0, Math.min(1, p));
  return (CURVES[name || 'linear'] || CURVES.linear)(clamped);
}
