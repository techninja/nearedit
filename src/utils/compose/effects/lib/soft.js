/**
 * Soft edges from gradients. A canvas gradient blends its stops in straight
 * lines; a feathered edge wants an S-curve (no visible start or end), so
 * these helpers lay down enough stops to follow one. The gradients carry
 * only alpha (black at varying opacity) and are used as masks with
 * `destination-in` / `destination-out`, or tinted by the caller.
 * Isomorphic and pure.
 * @module utils/compose/effects/lib/soft
 */

/** Straight segments a gradient uses to follow one S-curve. */
export const SEGMENTS = 10;

/**
 * Smoothstep: 0 below 0, 1 above 1, an S-curve between.
 * @param {number} t
 * @returns {number}
 */
export function smooth(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Add stops to a gradient that follow an opacity profile.
 * @param {any} gradient - A canvas gradient
 * @param {(position: number) => number} opacity - Opacity (0..1) at a
 *   position along the gradient
 * @param {number[]} positions - Where to put stops, each 0..1, ascending
 * @param {number[]} [rgb=[0, 0, 0]] - Colour of every stop
 */
export function opacityStops(gradient, opacity, positions, rgb = [0, 0, 0]) {
  for (const position of positions) {
    const at = Math.max(0, Math.min(1, position));
    const alpha = Math.max(0, Math.min(1, opacity(position)));
    gradient.addColorStop(at, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`);
  }
}

/**
 * Evenly spaced positions across a span, ends included.
 * @param {number} from
 * @param {number} to
 * @param {number} [segments=SEGMENTS]
 * @returns {number[]}
 */
export function spread(from, to, segments = SEGMENTS) {
  const out = [];
  for (let i = 0; i <= segments; i++) out.push(from + ((to - from) * i) / segments);
  return out;
}

/**
 * The corners of a frame relative to a point.
 * @param {number} width
 * @param {number} height
 * @param {number} x
 * @param {number} y
 * @returns {number[][]} Four `[dx, dy]`
 */
export const cornersFrom = (width, height, x, y) => [
  [-x, -y],
  [width - x, -y],
  [-x, height - y],
  [width - x, height - y],
];
