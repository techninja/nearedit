/**
 * The caption tokens of a kit: which of the word-by-word caption styles
 * (docs/app-spec/CAPTIONS.md) the brand speaks in, and what it changes in
 * it. They name roles, not values — the kit's heading or body font, its
 * accent or primary colour — so a kit that changes a colour changes its
 * captions with it. Every token is of a simple type, so the token editor
 * that is generated from `TOKEN_SCHEMA` shows them as it shows the rest.
 * `captionStyleOf` (`captionStyle.js`) turns them into a caption style.
 * Isomorphic and pure. Contract: docs/app-spec/DIRECTOR-BRAND.md § Captions.
 * @module utils/brand/captionTokens
 */

import { ANCHORS, PRESET_NAMES } from '#utils/captions/style.js';

/** Says "as the caption style has it": the kit changes nothing there. */
export const AS_PRESET = 'preset';

/** The face captions are set in: one of the kit's two fonts, or the style's own. */
export const CAPTION_FONTS = Object.freeze(['heading', 'body', AS_PRESET]);

/** The colour that marks the word being said: a colour of the kit, or the style's own. */
export const CAPTION_MARKS = Object.freeze(['accent', 'primary', 'text', AS_PRESET]);

/** Where captions sit: the style's own place, or an edge of the frame. */
export const CAPTION_PLACES = Object.freeze([AS_PRESET, ...ANCHORS]);

/**
 * `TOKEN_SCHEMA.caption`.
 * @type {Readonly<Record<string, import('./tokenSchema.js').TokenSpec>>}
 */
export const CAPTION_TOKENS = Object.freeze({
  preset: {
    type: 'select',
    label: 'Caption style',
    default: 'clean',
    options: PRESET_NAMES,
    description: 'The word-by-word caption style the brand starts from',
  },
  font: {
    type: 'select',
    label: 'Caption font',
    default: 'heading',
    options: CAPTION_FONTS,
    description: 'Captions are set in the heading font, the body font, or the style’s own',
  },
  highlight: {
    type: 'select',
    label: 'Word being said',
    default: 'accent',
    options: CAPTION_MARKS,
    description: 'The colour that marks the word being said',
  },
  size: {
    type: 'number',
    label: 'Caption size',
    default: 0,
    min: 0,
    max: 20,
    step: 0.1,
    unit: 'u',
    description: '0 leaves the size to the caption style',
  },
  position: {
    type: 'select',
    label: 'Caption position',
    default: AS_PRESET,
    options: CAPTION_PLACES,
    description: 'Where captions sit in the frame',
  },
});
