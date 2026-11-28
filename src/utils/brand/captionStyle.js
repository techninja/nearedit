/**
 * The caption style of a kit — the style every word-by-word caption of a
 * timeline is drawn with when it follows the brand. A kit names one of the
 * caption presets and what it changes; the rest comes from its own tokens:
 * the family of its heading or body font, its accent or primary colour for
 * the word being said, and — for a style with a plate — its surface and
 * text colours and its corner radius. What comes back is what a document
 * stores (`setCaptionStyle`): the preset's name and what differs from it.
 * Isomorphic and pure. Contract: docs/app-spec/DIRECTOR-BRAND.md § Captions.
 * @module utils/brand/captionStyle
 */

import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { normalizeCaptionStyle } from '#utils/captions/resolve.js';
import { ANCHORS, CAPTION_STYLE, PRESET_NAMES } from '#utils/captions/style.js';
import { AS_PRESET } from './captionTokens.js';

/** @typedef {import('./types.js').Kit} Kit */

const round = (/** @type {number} */ value) => Math.round(value * 10) / 10;

/**
 * The font token captions are set in, if the kit names one.
 * @param {Record<string, any>} tokens
 * @param {string} which - `heading`, `body` or `preset`
 * @returns {Record<string, any>|null}
 */
function fontOf(tokens, which) {
  if (which === AS_PRESET) return null;
  const font = tokens.font?.[which === 'body' ? 'body' : 'heading'];
  return font && typeof font.family === 'string' && font.family.trim() ? font : null;
}

/**
 * The caption style of a kit.
 * @param {Kit|null|undefined} kit - An effective kit (`resolveKit`); a kit
 *   without caption tokens gives the brand's fonts and colours on `clean`
 * @returns {Record<string, any>} A stored caption style: `{ preset, … }`
 */
export function captionStyleOf(kit) {
  const tokens = kit?.tokens || {};
  const own = tokens.caption || {};
  const colors = tokens.color || {};
  const preset = PRESET_NAMES.includes(own.preset) ? own.preset : 'clean';
  const base = CAPTION_PRESETS[preset].style;
  /** @type {Record<string, any>} */
  const style = { preset };

  const font = fontOf(tokens, own.font ?? 'heading');
  let scale = 1;
  if (font) {
    style.font = { family: font.family.trim() };
    if (font.upper) style.case = 'upper';
    // A family that runs small is drawn larger everywhere — in captions too. The
    // correction is for its lower case: a style that sets it in capitals takes half of it.
    const capitals = base.case === 'upper' && !font.upper;
    if (Number.isFinite(font.scale) && font.scale > 0) {
      scale = capitals ? Math.sqrt(font.scale) : font.scale;
    }
  }
  const { min, max } = CAPTION_STYLE.size;
  const asked = Number(own.size) > 0 ? Number(own.size) : base.size * scale;
  if (Number(own.size) > 0 || scale !== 1) style.size = round(Math.min(max, Math.max(min, asked)));

  const mark = own.highlight ?? 'accent';
  if (mark !== AS_PRESET && colors[mark]) style.highlight = { color: colors[mark] };
  if (ANCHORS.includes(own.position)) style.position = { anchor: own.position };

  if (base.plate.on) {
    // On a plate the words are the brand's text on its surface, as on its own plates.
    const radius = Number(tokens.shape?.radius);
    style.plate = {
      ...(colors.surface && { color: colors.surface }),
      ...(Number.isFinite(radius) && { radius }),
    };
    if (colors.text) style.color = colors.text;
  }
  return normalizeCaptionStyle(style);
}
