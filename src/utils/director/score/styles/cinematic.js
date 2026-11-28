/**
 * Cinematic: slow-building strings, low drums and bells.
 * @module utils/director/score/styles/cinematic
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'cinematic',
  label: 'Cinematic',
  description: 'Slow-building strings, low drums and bells: tension that resolves',
  bpm: [72, 96],
  scale: 'minor',
  keys: ['D', 'E', 'C', 'A', 'G'],
  progressions: ['i-VI-III-VII', 'i-iv-VI-V', 'i-VII-VI-V', 'VI-III-VII-i'],
  turn: 'V',
  kit: 'acoustic',
  drums: [
    layer('Low drums', 0.4, 0.6, { kick: 'X.........x.....', tomLow: '......o.......o.' }, 0.4),
    layer('Snare', 0.65, 0.55, { snare: '........X.......', ride: 'o...o...o...o...' }, 0.45),
    layer('Toms', 0.85, 0.5, { tomMid: '..x...x...x..x..', tomHigh: '.............x.x' }, 0.4),
  ],
  fill: {
    kick: 'X.......x.......',
    tomHigh: '........x.x.....',
    tomMid: '..........x.x...',
    tomLow: '............x.xX',
    snare: '..............oX',
  },
  hit: { crash: 'x...............', tomLow: 'x...............' },
  parts: [
    part('chords', 'Strings', 'strings', 0, [0.8, -0.2, 0.55, 0], { center: 64 }),
    part('chords', 'Pad', 'pad', 0.25, [0.6, 0.2, 0.5, 0], { center: 52 }),
    part('bass', 'Sub', 'sub', 0.4, [0.65, 0, 0, 0], { style: 'roots' }),
    part('arp', 'Bells', 'bell', 0.5, [0.45, 0.3, 0.6, 0.25], {
      rate: 1,
      mode: 'up',
      octave: 5,
      gate: 2,
    }),
    part(
      'lead',
      'Melody',
      'lead',
      0.75,
      [0.5, 0, 0.5, 0.2],
      { octave: 5, phrase: 4 },
      { glide: 0.08, attack: 0.03 },
    ),
  ],
  master: master(0.72, [0.85, 0.7], [1, 0.3]),
});
