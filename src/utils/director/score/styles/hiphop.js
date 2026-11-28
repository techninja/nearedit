/**
 * Hip-hop: a booming 808 kick and sub, rolling hats, a sparse bell line.
 * @module utils/director/score/styles/hiphop
 */

import { layer, master, part, style } from '#utils/director/score/style.js';

export default style({
  id: 'hiphop',
  label: 'Hip-hop',
  description: 'A head-nod trap beat: booming 808 kick and sub, rolling hats, a sparse bell line',
  bpm: [128, 148],
  steps: 32,
  scale: 'minor',
  keys: ['C', 'D', 'E', 'F', 'G'],
  progressions: ['i-i-VI-VII', 'i-VI-i-VII', 'i-iv-i-V', 'i-III-VI-v'],
  turn: 'V',
  kit: '808',
  drums: [
    layer(
      'Kick and hats',
      0.4,
      0.7,
      { kick: 'X.............x.....X...........', hat: 'x...x...x...x.x.x...x...xxxxx...' },
      0.05,
    ),
    layer('Clap', 0.65, 0.7, { clap: '................X...............' }, 0.2),
    layer('Tops', 0.85, 0.4, {
      openHat: '............x...............x...',
      rim: '......o.......................o.',
    }),
  ],
  fill: {
    kick: 'X.............x.....X.....x.....',
    clap: '................X...........X...',
    hat: 'x...x...x.x.x...xxxxxxxxx.x.xxxx',
    openHat: '............................x...',
  },
  hit: { crash: 'x...............................' },
  parts: [
    part('chords', 'Pad', 'pad', 0, [0.65, 0, 0.5, 0], { center: 58 }, { cutoff: 520 }),
    part('arp', 'Keys', 'keys', 0.25, [0.6, 0.25, 0.35, 0.3], {
      rate: 1,
      mode: 'random',
      octave: 4,
      gate: 1.5,
      velocity: 0.6,
    }),
    part('bass', '808', 'sub', 0.4, [0.75, 0, 0, 0], { style: 'roots' }, { release: 0.3 }),
    part('lead', 'Bell', 'bell', 0.75, [0.45, -0.25, 0.45, 0.35], {
      octave: 5,
      scale: 'minorPentatonic',
    }),
  ],
  master: master(0.69, [0.45, 0.45], [0.75, 0.35]),
});
