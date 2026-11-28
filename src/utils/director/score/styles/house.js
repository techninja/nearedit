/**
 * House: four on the floor, a syncopated bass, plucks and pads.
 * @module utils/director/score/styles/house
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'house',
  label: 'House',
  description: 'Four on the floor with a syncopated bass, bright plucks and off-beat stabs',
  bpm: [116, 130],
  scale: 'minor',
  keys: ['A', 'C', 'D', 'F', 'G'],
  progressions: ['i-VI-III-VII', 'i-VII-VI-VII', 'i-iv-VI-VII', 'VI-VII-i-i'],
  turn: 'VII',
  kit: '909',
  drums: [
    layer('Kick', 0.4, 0.7, { kick: 'X...X...X...X...' }),
    layer(
      'Claps and hats',
      0.65,
      0.6,
      { clap: '....X.......X...', hat: 'x.o.x.o.x.o.x.o.', openHat: '..x...x...x...x.' },
      0.08,
    ),
    layer('Tops', 0.85, 0.45, { shaker: 'o.x.o.x.o.x.o.x.', ride: '..x...x...x...x.' }, 0.1),
  ],
  fill: {
    kick: 'X...X...X...X.x.',
    clap: '....X.......X.xX',
    snare: '..........o.o.xX',
    hat: 'x.o.x.o.x.o.....',
  },
  hit: { crash: 'x...............' },
  parts: [
    part('chords', 'Pad', 'pad', 0, [0.85, 0, 0.45, 0], { center: 60 }),
    part('arp', 'Pluck', 'pluck', 0.25, [0.55, -0.3, 0.2, 0.35], {
      rate: 4,
      mode: 'updown',
      octaves: 2,
      octave: 4,
      gate: 0.7,
    }),
    part('bass', 'Bass', 'bass', 0.4, [0.75, 0, 0, 0], { style: 'syncopated' }),
    part('chords', 'Stab', 'keys', 0.5, [0.5, 0.35, 0.3, 0.25], {
      center: 72,
      hits: [[2.5, 0.4]],
      velocity: 0.8,
    }),
    part('lead', 'Lead', 'lead', 0.75, [0.55, 0.15, 0.25, 0.3], { octave: 5 }),
  ],
  master: master(0.55, [0.55, 0.5], [0.75, 0.4]),
});
