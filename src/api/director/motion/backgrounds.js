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
import { PATTERN_RECIPES } from './patterns.js';

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

/** @type {Record<string, (input: BackgroundInput) => Background>} */
const RECIPES = {
  solid,
  gradient,
  spotlight,
  noise,
  ...PATTERN_RECIPES,
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
