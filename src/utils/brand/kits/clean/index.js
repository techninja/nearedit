/**
 * `clean` — the built-in kit every chain rests on when it names no other:
 * a sans-serif, quiet plates, a thin bar in the brand colour, text that
 * rises in word by word. Its tokens are the schema's defaults.
 * Pure data. Isomorphic.
 * @module utils/brand/kits/clean
 */

import { STANDARD_DEFAULTS } from '#utils/brand/kits/parts.js';
import { defaultTokens } from '#utils/brand/tokens.js';
import { bug, caption, lowerThird, quote, title } from './overlays.js';
import { chapter, intro, outro, stinger } from './segments.js';

export default {
  id: 'clean',
  name: 'Clean',
  description: 'A quiet sans-serif on dark plates, a thin bar of colour, text that rises in',
  tokens: defaultTokens(),
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
