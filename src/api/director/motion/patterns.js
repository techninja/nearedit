/**
 * Pattern backgrounds of a motion piece: every kind of the `pattern`
 * generator as a quiet, drifting ground in two colours of the theme. A
 * kind the catalog gains later is drawn at once, in a neutral style.
 * @module api/director/motion/patterns
 */

import { rand } from '#utils/compose/random.js';
import { mix } from '#utils/director/motion/color.js';
import { PATTERNS } from '#utils/director/motion/vocab.js';

/**
 * How a pattern is drawn: cell size (share of the frame's shorter side),
 * coverage, angle, how far the pattern's colour departs from the ground
 * (0..1 toward the light colour), and its drift per second (same share).
 * @typedef {{ size: number, fill: number, angle: number, tone: number,
 *   drift: [number, number] }} PatternStyle
 */

/** @type {Record<string, PatternStyle>} */
const STYLES = {
  dots: { size: 0.06, fill: 0.2, angle: 0, tone: 0.75, drift: [0.012, 0.006] },
  grid: { size: 0.09, fill: 0.035, angle: 0, tone: 0.85, drift: [0.01, 0.01] },
  stripes: { size: 0.07, fill: 0.5, angle: 35, tone: 0.5, drift: [0.03, 0] },
  checker: { size: 0.11, fill: 0.5, angle: 0, tone: 0.4, drift: [0.02, 0.012] },
};
/** @type {PatternStyle} */
const ANY = { size: 0.08, fill: 0.3, angle: 0, tone: 0.5, drift: [0.015, 0.008] };

/**
 * The recipe of one pattern kind.
 * @param {string} pattern
 * @returns {(input: import('./backgrounds.js').BackgroundInput) =>
 *   import('./backgrounds.js').Background}
 */
const patterned = (pattern) => (input) => {
  const { colors, lengthF, fps, seed, frame } = input;
  const style = STYLES[pattern] || ANY;
  const short = Math.min(frame.width, frame.height);
  const seconds = lengthF / fps;
  const side = rand(seed, 1) < 0.5 ? -1 : 1;
  return {
    type: 'pattern',
    params: {
      pattern,
      background: colors[1],
      color: mix(colors[1], colors[2], style.tone),
      size: Math.round(short * style.size),
      fill: style.fill,
      angle: style.angle * side,
    },
    keys: {
      offsetX: [
        [0, 0],
        [lengthF, Math.round(short * style.drift[0] * seconds * side)],
      ],
      offsetY: [
        [0, 0],
        [lengthF, Math.round(short * style.drift[1] * seconds)],
      ],
    },
  };
};

/** A recipe per pattern kind of the catalog. */
export const PATTERN_RECIPES = Object.fromEntries(
  PATTERNS.map((pattern) => [pattern, patterned(pattern)]),
);
