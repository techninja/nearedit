/**
 * Reference documents: particle layers — every built-in sprite in each
 * blend between particles, presets as shipped, an image sprite with and
 * without tint, a field that starts full, and an emitter under keyframes.
 * Each comes with the time to draw it at.
 * @module tests/compose/cases/particles
 */

import { PRESETS } from '#utils/compose/generators/particles.js';
import { SPRITES } from '#utils/compose/generators/particles/shapes.js';
import { doc, gen } from '../build.js';
import { sky } from './generators.js';

const night = () => gen('bg', 'gradient', { angle: 0, color1: '#020617', color2: '#1e1b4b' });
const preset = (/** @type {string} */ id) => PRESETS.find((entry) => entry.id === id).params;
const particles = (/** @type {string} */ id, /** @type {object} */ params, extra = {}) =>
  gen(id, 'particles', params, extra);

/** A slow ring of each built-in sprite, turning, in the three blends by turns. */
const everySprite = () =>
  SPRITES.map((sprite, i) => [
    particles(`s${i}`, {
      sprite,
      emitter: 'ring',
      position: { x: 0.1 + (i % 5) * 0.2, y: i < 5 ? 0.3 : 0.72 },
      emitterWidth: 0.1,
      emitterHeight: 0.18,
      rate: 6,
      lifetime: 2,
      speed: 30,
      radial: 60,
      size: 90,
      sizeJitter: 0.5,
      rotationSpread: 360,
      spin: 40,
      blend: ['normal', 'add', 'screen'][i % 3],
      color2: '#fb923c',
      prewarm: true,
    }),
  ]);

/** Glowing dots that wander, swirl, change colour over life and add up. */
const dots = {
  emitter: 'box',
  emitterWidth: 0.9,
  emitterHeight: 0.7,
  rate: 120,
  lifetime: 2.5,
  speed: 60,
  turbulence: 180,
  swirl: 20,
  size: 46,
  sizeEnd: 0.2,
  colors: 3,
  color2: '#38bdf8',
  color3: '#a21caf',
  twinkle: 0.6,
};

/** The emitter's position, the size, the last colour, gravity and density, all mid-move. */
const moving = {
  'generator.params.position.x': [
    { t: 0, v: 0.15, ease: 'ease-in-out' },
    { t: 2, v: 0.85 },
  ],
  'generator.params.size': [
    { t: 0, v: 14 },
    { t: 2, v: 60 },
  ],
  'generator.params.color3': [
    { t: 0, v: '#22d3ee' },
    { t: 2, v: '#e11d48' },
  ],
  'generator.params.gravityY': [
    { t: 0, v: -300 },
    { t: 2, v: 2400 },
  ],
  'generator.params.density': [
    { t: 0, v: 0.4 },
    { t: 2, v: 1 },
  ],
};

/**
 * @param {{ logo: string }} files - Fixture pictures
 * @returns {import('./index.js').Case[]}
 */
export function particleCases({ logo }) {
  const pictured = { ...preset('images'), image: logo, size: 220 };
  /** @type {Record<string, [any, number]>} */
  const docs = {
    'particles-add-dots': [doc([[particles('a', dots, { blendMode: 'add' })], [sky()]]), 2.2],
    // The confetti preset mid-air: tumbling paper over each other, in five colours.
    'particles-confetti': [
      doc([[particles('a', { ...preset('confetti'), size: 48 })], [night()]]),
      1.1,
    ],
    // A picture with transparency as the sprite: in its own colours, falling
    // and turning; and tinted over life, pointing along its travel.
    'particles-image': [
      doc([
        [particles('a', pictured)],
        [
          particles('b', {
            sprite: 'image',
            image: logo,
            tint: 0.8,
            emitter: 'circle',
            emitterWidth: 0.5,
            emitterHeight: 0.6,
            rate: 14,
            lifetime: 2,
            speed: 0,
            radial: 160,
            size: 80,
            color1: '#f0abfc',
            color2: '#22d3ee',
            align: true,
          }),
        ],
        [sky()],
      ]),
      2.6,
    ],
    // The snow preset on the very first frame of the clip: a prewarmed field is already full.
    'particles-prewarm': [doc([[particles('a', preset('snow'))], [night()]]), 0],
    // The sparks preset — streaks stretched along their travel — with five
    // parameters in the middle of a keyframe move.
    'particles-keyframed': [
      doc([[particles('a', preset('sparks'), { keyframes: moving })], [night()]]),
      1.3,
    ],
    'particles-sprites': [doc([...everySprite(), [night()]]), 1.7],
  };
  return Object.entries(docs).map(([name, [edl, time]]) => ({
    name,
    edl,
    time,
    text: false,
    footage: {},
  }));
}
