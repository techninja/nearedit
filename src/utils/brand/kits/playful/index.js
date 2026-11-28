/**
 * `playful` — a built-in kit that smiles: handwriting on white pills and
 * cards, round corners, pink and violet on warm paper, everything popping
 * in letter by letter. Pure data. Isomorphic.
 * @module utils/brand/kits/playful
 */

import { NO_LOGO, STANDARD_DEFAULTS } from '#utils/brand/kits/parts.js';
import { bug, caption, lowerThird, quote, title } from './overlays.js';
import { chapter, intro, outro, stinger } from './segments.js';

export default {
  id: 'playful',
  name: 'Playful',
  description: 'Handwriting on white pills, round corners, pink on warm paper, letters that pop',
  tokens: {
    color: {
      background: '#fff3d1',
      surface: '#ffffff',
      primary: '#e6226f',
      accent: '#6d4aff',
      text: '#1f1d3d',
      muted: '#55527a',
    },
    font: {
      heading: { family: 'Caveat', weight: 700, lineHeight: 1, scale: 1.5 },
      body: { family: 'Inter', weight: 700, lineHeight: 1.25 },
    },
    logo: NO_LOGO,
    shape: { radius: 3, stroke: 0.5 },
    space: { margin: 6, gap: 1.4 },
    motion: { enter: 'scale', exit: 'scale', by: 'char', ease: 'back-out', speed: 1 },
    sound: { style: 'bossa', key: 'G', scale: 'major' },
    caption: { preset: 'pop', font: 'heading', highlight: 'primary', size: 0, position: 'preset' },
  },
  elements: {
    'lower-third': lowerThird,
    title,
    caption,
    quote,
    chapter,
    intro,
    outro,
    bug,
    stinger,
  },
  defaults: STANDARD_DEFAULTS,
};
