/**
 * Synthwave: octave bass, a gated-snare backbeat, arpeggios, a soaring lead.
 * @module utils/director/score/styles/synthwave
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'synthwave',
  label: 'Synthwave',
  description: 'An eighties night drive: octave bass, a big snare, arpeggios and a soaring lead',
  bpm: [88, 112],
  scale: 'minor',
  keys: ['A', 'B', 'C', 'D', 'E'],
  progressions: ['i-VI-III-VII', 'i-III-VII-VI', 'VI-VII-i-i', 'i-VI-iv-VII'],
  turn: 'VII',
  kit: '909',
  drums: [
    layer('Kick and hats', 0.4, 0.7, { kick: 'X.......X.x.....', hat: 'x.x.x.x.x.x.x.x.' }, 0.05),
    layer('Snare', 0.65, 0.7, { snare: '....X.......X...' }, 0.35),
    layer('Tops', 0.85, 0.4, { openHat: '..x...x...x...x.', tomLow: '.............x.x' }, 0.2),
  ],
  fill: {
    kick: 'X.......X.......',
    snare: '....X...x.x.....',
    tomHigh: '..........xx....',
    tomMid: '............xx..',
    tomLow: '..............xX',
  },
  hit: { crash: 'x...............' },
  parts: [
    part('chords', 'Strings', 'strings', 0, [0.75, 0, 0.5, 0], { center: 62 }),
    part('arp', 'Arp', 'arp', 0.25, [0.5, 0.3, 0.2, 0.35], {
      rate: 4,
      mode: 'up',
      octaves: 2,
      octave: 4,
    }),
    part('bass', 'Bass', 'bass', 0.4, [0.7, 0, 0, 0], { style: 'octaves' }),
    part('lead', 'Lead', 'lead', 0.75, [0.55, -0.1, 0.35, 0.35], { octave: 5 }),
  ],
  master: master(0.63, [0.7, 0.6], [0.75, 0.4]),
});
