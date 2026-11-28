/**
 * Bossa nova: a soft clave on the rim, warm sevenths and a lazy melody.
 * @module utils/director/score/styles/bossa
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'bossa',
  label: 'Bossa nova',
  description: 'A soft clave on the rim, warm seventh chords and a lazy melody: light and sunny',
  bpm: [104, 132],
  scale: 'major',
  keys: ['C', 'F', 'G', 'D', 'A', 'Bb'],
  progressions: ['I6-vi7-ii7-V7', 'ii7-V7-I6-vi7', 'I6-ii7-iii7-ii7', 'IV6-V7-iii7-vi7'],
  turn: 'V7',
  kit: 'acoustic',
  drums: [
    layer('Clave', 0.4, 0.55, { rim: 'x..x..x...x..x..', kick: 'X.....x.X.....x.' }, 0.15),
    layer('Hats', 0.65, 0.45, { hat: 'o.o.o.o.o.o.o.o.' }, 0.1),
    layer('Shaker', 0.85, 0.4, { shaker: 'o.x.o.x.o.x.o.x.' }, 0.1),
  ],
  fill: {
    kick: 'X.....x.X.....x.',
    rim: 'x..x..x...x.x.x.',
    tomHigh: '............o.o.',
    tomMid: '.............o.o',
  },
  hit: { ride: 'x...............' },
  parts: [
    part('chords', 'Keys', 'keys', 0, [0.8, 0.15, 0.3, 0], {
      center: 62,
      hits: [
        [0, 1.4],
        [1.5, 0.9],
        [3, 0.9],
      ],
      velocity: 0.65,
    }),
    part('bass', 'Bass', 'bass', 0.25, [0.65, 0, 0, 0], { style: 'syncopated' }),
    part('chords', 'Strings', 'strings', 0.5, [0.45, -0.25, 0.5, 0], { center: 67 }),
    part('lead', 'Pluck', 'pluck', 0.75, [0.55, -0.15, 0.35, 0.25], {
      octave: 5,
      scale: 'majorPentatonic',
    }),
  ],
  master: master(0.79, [0.5, 0.4], [0.75, 0.25]),
});
