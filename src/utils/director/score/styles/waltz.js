/**
 * A waltz in three: plucked chords, a soft kit and a singing melody.
 * @module utils/director/score/styles/waltz
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'waltz',
  label: 'Waltz',
  description: 'A warm waltz in three: plucked chords, a soft played kit and a singing melody',
  bpm: [90, 132],
  beatsPerBar: 3,
  steps: 12,
  scale: 'major',
  keys: ['C', 'D', 'F', 'G', 'A', 'Bb'],
  progressions: ['I-IV-V-I', 'I-vi-IV-V', 'I-V-vi-IV', 'I-iii-IV-V'],
  turn: 'V7',
  kit: 'acoustic',
  drums: [
    layer('Kit', 0.4, 0.55, { kick: 'X...........', rim: '....o...o...' }, 0.4),
    layer('Ride', 0.65, 0.4, { ride: 'o...o...o...' }, 0.4),
  ],
  fill: {
    kick: 'X...........',
    rim: '....o.......',
    tomMid: '......o.....',
    tomLow: '........o.x.',
  },
  hit: { crash: 'x...........' },
  parts: [
    part('chords', 'Plucks', 'pluck', 0, [0.5, 0.2, 0.35, 0.15], {
      center: 64,
      hits: [
        [1, 0.8],
        [2, 0.8],
      ],
      velocity: 0.65,
    }),
    part('bass', 'Bass', 'bass', 0.25, [0.55, 0, 0.1, 0], { style: 'roots' }),
    part('chords', 'Strings', 'strings', 0.4, [0.75, -0.2, 0.55, 0], { center: 62 }),
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
  master: master(0.77, [0.75, 0.6], [1, 0.3]),
});
