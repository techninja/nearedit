/**
 * Lo-fi hip-hop: dusty swung drums, electric-piano sevenths, a lazy sub.
 * @module utils/director/score/styles/lofi
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'lofi',
  label: 'Lo-fi',
  description: 'Dusty swung drums, soft electric-piano sevenths and a lazy sub: easy to talk over',
  bpm: [70, 90],
  scale: 'dorian',
  keys: ['D', 'E', 'A', 'C', 'G'],
  progressions: ['i7-IV7-bVII6-v7', 'i7-v7-IV7-i7', 'ii7-v7-i7-i7', 'i7-bIII6-IV7-v7'],
  turn: 'V7',
  swing: 0.3,
  kit: 'lofi',
  drums: [
    layer('Kick and hats', 0.4, 0.6, { kick: 'X......x.xx.....', hat: 'x.o.x.o.x.o.x.o.' }, 0.1),
    layer('Snare', 0.65, 0.7, { snare: '....X.......X...', rim: '..........o.....' }, 0.15),
    layer('Shaker', 0.85, 0.35, { shaker: 'o.o.o.o.o.o.o.o.' }, 0.15),
  ],
  fill: {
    kick: 'X......x.x......',
    snare: '....X.....o.X.oX',
    hat: 'x.o.x.o.x.o.x...',
    openHat: '..............x.',
  },
  hit: { ride: 'x...............' },
  parts: [
    part(
      'chords',
      'Keys',
      'keys',
      0,
      [0.75, 0, 0.3, 0],
      { center: 62, gap: 0.6, velocity: 0.7 },
      { lfoAmp: 0.15, cutoff: 3000 },
    ),
    part('bass', 'Sub', 'sub', 0.4, [0.75, 0, 0, 0], { style: 'syncopated' }),
    part(
      'chords',
      'Dust',
      'pad',
      0.25,
      [0.45, -0.3, 0.6, 0],
      { center: 74 },
      { cutoff: 500, attack: 1.2 },
    ),
    part('lead', 'Bell', 'bell', 0.75, [0.45, 0.3, 0.5, 0.3], {
      octave: 5,
      scale: 'minorPentatonic',
    }),
  ],
  master: master(0.78, [0.35, 0.4], [1.5, 0.3]),
});
