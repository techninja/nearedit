/**
 * Upbeat corporate: muted plucks, claps and a major key.
 * @module utils/director/score/styles/corporate
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'corporate',
  label: 'Upbeat',
  description: 'Bright and friendly: muted plucks, claps and a major key, for product videos',
  bpm: [104, 124],
  scale: 'major',
  keys: ['C', 'D', 'E', 'F', 'G', 'A'],
  progressions: ['I-V-vi-IV', 'vi-IV-I-V', 'I-IV-vi-V', 'IV-I-V-vi'],
  turn: 'V',
  kit: 'acoustic',
  drums: [
    layer('Kick', 0.4, 0.7, { kick: 'X.....x.X.......' }),
    layer('Claps and hats', 0.65, 0.6, { clap: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' }, 0.15),
    layer('Shaker', 0.85, 0.4, { shaker: 'o.x.o.x.o.x.o.x.' }, 0.1),
  ],
  fill: {
    kick: 'X.......X.......',
    snare: '........o.o.x.xX',
    tomHigh: '..........x.....',
    tomMid: '............x...',
    hat: 'x.x.x.x.........',
  },
  hit: { crash: 'x...............' },
  parts: [
    part('chords', 'Pad', 'pad', 0, [0.85, 0, 0.4, 0], { center: 60 }),
    part('arp', 'Plucks', 'pluck', 0.25, [0.5, -0.25, 0.2, 0.3], {
      rate: 2,
      mode: 'updown',
      octave: 4,
      gate: 0.6,
    }),
    part('bass', 'Bass', 'bass', 0.4, [0.7, 0, 0, 0], { style: 'octaves' }),
    part('chords', 'Keys', 'keys', 0.5, [0.6, 0.25, 0.25, 0], {
      center: 67,
      hits: [
        [0, 0.9],
        [1.5, 0.9],
        [3, 0.9],
      ],
      velocity: 0.7,
    }),
    part('lead', 'Bell', 'bell', 0.75, [0.45, 0.2, 0.4, 0.3], {
      octave: 5,
      scale: 'majorPentatonic',
    }),
  ],
  master: master(0.68, [0.5, 0.45], [0.75, 0.3]),
});
