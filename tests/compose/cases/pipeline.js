/**
 * Reference documents: placement, blending, track surfaces, effects and
 * keyframes — the layer pipeline around the sources.
 * @module tests/compose/cases/pipeline
 */

import { doc, fx, gen, media } from '../build.js';
import { sky } from './generators.js';

const BLENDS = [
  'add',
  'screen',
  'multiply',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'soft-light',
];

/** One soft blob per blend mode, in two rows of four. */
const blobs = () =>
  BLENDS.map((blendMode, i) => {
    const center = { x: 0.14 + (i % 4) * 0.24, y: i < 4 ? 0.28 : 0.72 };
    const params = { kind: 'radial', center, size: 0.16, color1: '#ffe14d', color2: '#2850ff00' };
    return [gen(`m${i}`, 'gradient', params, { blendMode })];
  });

/**
 * @param {{ card: string, logo: string }} files - Fixture pictures
 * @returns {Record<string, any>} Documents by case name. Clip `a` of
 *   `footage` is a video clip: give it the card as its frame
 */
export function pipelineDocs({ card, logo }) {
  const small = { fit: 'contain', scaleX: 0.7, scaleY: 0.7 };
  const tilted = {
    x: -220,
    y: 90,
    scaleX: 0.7,
    scaleY: 0.7,
    rotation: -8,
    opacity: 0.85,
    cropLeft: 0.1,
    cropTop: 0.2,
    anchorX: 0.2,
    anchorY: 0.8,
  };
  const chain = [
    fx('blur', { radius: 6 }),
    fx('glow', { radius: 20, intensity: 1 }),
    fx('blur', { radius: 3 }),
    fx('nope'),
    fx('blur', { radius: 90 }, false),
  ];
  const moving = {
    keyframes: {
      'transform.x': [
        { t: 0, v: -600, ease: 'ease-out' },
        { t: 3, v: 600 },
      ],
      'transform.rotation': [
        { t: 0, v: 0 },
        { t: 4, v: 180 },
      ],
      'generator.params.fill': [
        { t: 0, v: '#ffffff' },
        { t: 2, v: '#f97316' },
      ],
      'effects.fx_blur.radius': [
        { t: 0, v: 40, ease: 'ease-in' },
        { t: 2, v: 0 },
      ],
    },
    effects: [fx('blur', { radius: 40 })],
  };
  return {
    'still-contain': doc([[media('a', card, { transform: small })], [sky()]]),
    'still-transformed': doc([
      [media('a', logo, { transform: { ...small, x: 520, y: -160, rotation: 20 } })],
      [media('b', card, { transform: tilted })],
      [sky()],
    ]),
    footage: doc([[media('a', '/media/clip.mp4')]]),
    'generator-transformed': doc([
      [
        gen(
          'a',
          'pattern',
          { pattern: 'checker', size: 120 },
          { transform: { scaleX: 0.5, scaleY: 0.5, rotation: 30, x: 300, cropRight: 0.25 } },
        ),
      ],
      [sky()],
    ]),
    blends: doc([...blobs(), [media('bg', card)]]),
    // A dissolve at its midpoint, on a track that is itself half transparent.
    'track-opacity': doc([
      {
        opacity: 0.55,
        clips: [
          media('out', card, { timelineEnd: 3, fadeOut: 2 }),
          gen('in', 'pattern', { pattern: 'dots', size: 140 }, { timelineStart: 1, fadeIn: 2 }),
        ],
      },
      [gen('bg', 'gradient', { angle: 0, color1: '#022c22', color2: '#bef264' })],
    ]),
    'track-blend-effects': doc([
      {
        blendMode: 'screen',
        effects: [fx('blur', { radius: 18 })],
        clips: [gen('a', 'shape', { shape: 'star', fill: '#38bdf8', width: 0.4, height: 0.7 })],
      },
      [media('bg', card)],
    ]),
    'effect-blur': doc([[media('a', card, { effects: [fx('blur', { radius: 24 })] })]]),
    'effect-glow': doc([
      [
        gen(
          'a',
          'shape',
          { shape: 'polygon', sides: 3, fill: '#f0abfc', width: 0.3, height: 0.5 },
          { effects: [fx('glow', { radius: 36, intensity: 1.6 })] },
        ),
      ],
      [gen('bg', 'solid', { color: '#0b1020' })],
    ]),
    'effect-chain': doc([
      [media('a', logo, { transform: { ...small, x: -300 }, blendMode: 'add', effects: chain })],
      [sky()],
    ]),
    keyframes: doc([[gen('a', 'shape', { width: 0.2, height: 0.3 }, moving)], [sky()]]),
  };
}
