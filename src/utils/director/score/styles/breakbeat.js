/**
 * Breakbeat: fast broken drums over a deep sub and wide pads.
 * @module utils/director/score/styles/breakbeat
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'breakbeat',
  label: 'Breakbeat',
  description: 'Fast broken drums over a deep sub and wide pads: restless and driving',
  bpm: [150, 172],
  scale: 'minor',
  keys: ['E', 'F', 'G', 'A', 'D'],
  progressions: ['i-i-VI-VI', 'i-i-VII-VI', 'i-i-iv-iv', 'VI-VI-VII-i'],
  turn: 'VII',
  swing: 0.1,
  kit: '909',
  drums: [
    layer('Kick and hats', 0.4, 0.65, { kick: 'X.x.......xx....', hat: 'x.x.x.x.x.x.x.x.' }, 0.05),
    layer('Snare', 0.65, 0.7, { snare: '....X..o.o..X...' }, 0.15),
    layer('Ride', 0.85, 0.35, { ride: 'x...x...x...x...', shaker: '..o...o...o...o.' }, 0.1),
  ],
  fill: { kick: 'X.x.......x.....', snare: '....X..o.oX.XoXX', hat: 'x.x.x.x.x.......' },
  hit: { crash: 'x...............' },
  parts: [
    part('chords', 'Pad', 'pad', 0, [0.75, 0, 0.5, 0], { center: 60 }),
    part('arp', 'Arp', 'arp', 0.25, [0.45, 0.3, 0.25, 0.4], {
      rate: 2,
      mode: 'updown',
      octaves: 2,
      octave: 4,
    }),
    part('bass', 'Sub', 'sub', 0.4, [0.75, 0, 0, 0], { style: 'roots' }),
    part('chords', 'Stab', 'keys', 0.5, [0.5, -0.3, 0.3, 0.3], {
      center: 72,
      hits: [
        [0, 0.4],
        [1.5, 0.4],
      ],
      velocity: 0.8,
    }),
    part('lead', 'Lead', 'bell', 0.75, [0.45, 0.2, 0.45, 0.35], {
      octave: 5,
      scale: 'minorPentatonic',
      phrase: 4,
    }),
  ],
  master: master(0.63, [0.6, 0.5], [0.75, 0.4]),
});
