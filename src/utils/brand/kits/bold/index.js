/**
 * `bold` — a built-in kit that shouts: tall condensed capitals on solid
 * blocks of colour, square corners, black and one loud colour, everything
 * wiped on fast. Pure data. Isomorphic.
 * @module utils/brand/kits/bold
 */

import { NO_LOGO, STANDARD_DEFAULTS } from '#utils/brand/kits/parts.js';
import { bug, caption, lowerThird, quote, title } from './overlays.js';
import { chapter, intro, outro, stinger } from './segments.js';

export default {
  id: 'bold',
  name: 'Bold',
  description: 'Tall capitals on solid blocks of colour, square corners, fast wipes',
  tokens: {
    color: {
      background: '#0a0a0a',
      surface: '#111111',
      primary: '#facc15',
      accent: '#ef4444',
      text: '#ffffff',
      muted: '#d4d4d4',
    },
    font: {
      heading: {
        ...{ family: 'Bebas Neue', weight: 400, upper: true },
        ...{ tracking: 0.02, lineHeight: 1, scale: 1.3 },
      },
      body: { family: 'Inter', weight: 700, lineHeight: 1.2 },
    },
    logo: NO_LOGO,
    shape: { radius: 0, stroke: 0.8 },
    space: { margin: 5, gap: 1.2 },
    motion: { enter: 'wipe', exit: 'wipe', by: 'block', ease: 'ease-out', speed: 1.15 },
    sound: { style: 'breakbeat', key: 'E', scale: 'minor' },
    caption: {
      preset: 'boxed',
      font: 'heading',
      highlight: 'primary',
      size: 0,
      position: 'preset',
    },
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
