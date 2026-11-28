/**
 * `documentary` — a built-in kit that stays out of the picture's way: a
 * serif set straight on the footage, hairlines in muted gold, small spaced
 * capitals, slow fades. Pure data. Isomorphic.
 * @module utils/brand/kits/documentary
 */

import { NO_LOGO, STANDARD_DEFAULTS } from '#utils/brand/kits/parts.js';
import { bug, caption, lowerThird, quote, title } from './overlays.js';
import { chapter, intro, outro, stinger } from './segments.js';

export default {
  id: 'documentary',
  name: 'Documentary',
  description: 'A serif on the picture itself, hairlines in muted gold, slow fades',
  tokens: {
    color: {
      background: '#0d0c0a',
      surface: '#221f1a',
      primary: '#c9a561',
      accent: '#9a3b22',
      text: '#f5f0e6',
      muted: '#d6cdbd',
    },
    font: {
      heading: { family: 'Playfair Display', weight: 700, lineHeight: 1.14 },
      body: { family: 'Inter', weight: 400, lineHeight: 1.35 },
    },
    logo: NO_LOGO,
    shape: { radius: 0, stroke: 0.18 },
    space: { margin: 7, gap: 1.6 },
    motion: { enter: 'fade', exit: 'fade', by: 'line', ease: 'ease-in-out', speed: 0.85 },
    sound: { style: 'cinematic', key: 'D', scale: 'minor' },
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
