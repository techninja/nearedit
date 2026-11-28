/**
 * Ambient: long pads and bells, no drums.
 * @module utils/director/score/styles/ambient
 */

import { master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'ambient',
  label: 'Ambient',
  description: 'Slow, wide and weightless: long pads, bells and a deep sub, no drums',
  bpm: [60, 80],
  scale: 'major',
  keys: ['C', 'D', 'F', 'G', 'A'],
  progressions: ['Iadd9-IV-vi-IV', 'I-iii-IV-I', 'vi-IV-I-V', 'Isus2-IV-I-Vsus4'],
  turn: 'IV',
  parts: [
    part('chords', 'Pad', 'pad', 0, [0.8, 0, 0.6, 0], { center: 60 }),
    part('arp', 'Bells', 'bell', 0.25, [0.4, 0.3, 0.6, 0.4], {
      rate: 1,
      mode: 'up',
      octave: 5,
      gate: 2,
      velocity: 0.6,
    }),
    part('bass', 'Sub', 'sub', 0.4, [0.7, 0, 0, 0], { style: 'roots' }),
    part('chords', 'Strings', 'strings', 0.5, [0.5, -0.25, 0.55, 0], { center: 72 }),
    part('lead', 'Glass', 'keys', 0.75, [0.5, 0.2, 0.55, 0.35], {
      octave: 5,
      scale: 'majorPentatonic',
      phrase: 4,
    }),
  ],
  master: master(0.87, [0.85, 0.75], [1, 0.45]),
});
