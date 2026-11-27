/**
 * Background recipes of a motion piece: each turns three colours of the
 * theme into one generator with a slow move keyed over the life of the
 * clip, so no background ever stands still. Lengths follow the output
 * resolution; nothing here depends on the frame's shape.
 * Reference: docs/app-spec/DIRECTOR-MOTION.md § Backgrounds.
 * @module api/director/motion/backgrounds
 */

import { rand } from '#utils/compose/random.js';
import { mix } from '#utils/director/motion/color.js';
import { PATTERNS } from '#utils/director/motion/vocab.js';

/**
 * @typedef {Object} BackgroundInput
 * @property {[string, string, string]} colors - Edge colour, middle, light
 * @property {number} lengthF - Length of the clip, frames
 * @property {number} fps
 * @property {number} seed - Varies the move
 * @property {{ width: number, height: number }} frame
 * @typedef {Object} Background
 * @property {string} type - Generator type
 * @property {Record<string, any>} params
 * @property {Record<string, import('./clips.js').Key[]>} keys - Paths below
 *   `generator.params.`, keyed in frames since the clip began
 */

/** How each pattern is drawn: cell size (of the shorter side), coverage,
 * angle, how far the pattern colour departs from the ground, drift per second. */
const PATTERN_STYLE = {
  dots: { size: 0.06, fill: 0.2, angle: 0, tone: 0.75, drift: [0.012, 0.006] },
  grid: { size: 0.09, fill: 0.035, angle: 0, tone: 0.85, drift: [0.01, 0.01] },
  stripes: { size: 0.07, fill: 0.5, angle: 35, tone: 0.5, drift: [0.03, 0] },
  checker: { size: 0.11, fill: 0.5, angle: 0, tone: 0.4, drift: [0.02, 0.012] },
};
/** A pattern the catalog gains later still draws, in a neutral way. */
const ANY_PATTERN = { size: 0.08, fill: 0.3, angle: 0, tone: 0.5, drift: [0.015, 0.008] };

/**
 * @param {BackgroundInput} input
 * @returns {Background}
 */
function gradient({ colors: [edge, middle, light], lengthF, fps, seed }) {
  const seconds = lengthF / fps;
  const turn = Math.max(18, Math.min(70, seconds * 9)) * (rand(seed, 1) < 0.5 ? -1 : 1);
  const from = 80 + rand(seed, 2) * 60 - Math.min(0, turn);
  return {
    type: 'gradient',
    params: { kind: 'linear', stops: 3, color1: edge, color2: middle, color3: light, size: 1.3 },
    keys: {
      angle: [
        [0, Math.round(from), 'sine'],
        [lengthF, Math.round(from + turn)],
      ],
    },
  };
}

/**
 * @param {BackgroundInput} input
 * @returns {Background}
 */
function spotlight({ colors: [edge, middle, light], lengthF, seed }) {
  const side = rand(seed, 1) < 0.5 ? -1 : 1;
  const reach = 0.1 + rand(seed, 2) * 0.08;
  return {
    type: 'gradient',
    params: { kind: 'radial', stops: 3, color1: light, color2: middle, color3: edge },
    keys: {
      'center.x': [
        [0, 0.5 - side * reach, 'sine'],
        [lengthF, 0.5 + side * reach],
      ],
      'center.y': [
        [0, 0.46, 'sine'],
        [lengthF, 0.54],
      ],
      size: [
        [0, 0.8, 'sine'],
        [lengthF, 1.05],
      ],
    },
  };
}

/**
 * @param {BackgroundInput} input
 * @returns {Background}
 */
function noise({ colors: [edge, middle, light], lengthF, seed, frame }) {
  const long = Math.max(frame.width, frame.height);
  return {
    type: 'noise',
    params: {
      colors: 3,
      color1: edge,
      color2: middle,
      color3: light,
      scale: Math.round(long * 0.5),
      octaves: 3,
      speed: 0.3,
      driftX: Math.round(long * 0.012 * (rand(seed, 1) < 0.5 ? -1 : 1)),
      contrast: 1.5,
    },
    keys: {
      balance: [
        [0, -0.2, 'sine'],
        [lengthF, 0.05],
      ],
    },
  };
}

/**
 * @param {BackgroundInput} input
 * @returns {Background}
 */
function solid({ colors: [edge, middle, light], lengthF, seed }) {
  const to = rand(seed, 1) < 0.5 ? mix(middle, light, 0.6) : mix(middle, edge, 0.5);
  return {
    type: 'solid',
    params: { color: middle },
    keys: {
      color: [
        [0, middle, 'sine'],
        [lengthF, to],
      ],
    },
  };
}

/**
 * @param {string} pattern
 * @returns {(input: BackgroundInput) => Background}
 */
const patterned = (pattern) => (input) => {
  const { colors, lengthF, fps, seed, frame } = input;
  const style = PATTERN_STYLE[pattern] || ANY_PATTERN;
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

/** @type {Record<string, (input: BackgroundInput) => Background>} */
const RECIPES = {
  solid,
  gradient,
  spotlight,
  noise,
  ...Object.fromEntries(PATTERNS.map((pattern) => [pattern, patterned(pattern)])),
};

/**
 * The generator and its move for a background recipe.
 * @param {string} recipe - A name of `BACKGROUNDS`
 * @param {BackgroundInput} input
 * @returns {Background}
 */
export function background(recipe, input) {
  return (RECIPES[recipe] || RECIPES.gradient)(input);
}
