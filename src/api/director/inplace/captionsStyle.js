/**
 * The caption style a timeline has once `add_captions` switched captions
 * on, and why. A look that was asked for wins; when none was, a timeline
 * that has a caption style of its own keeps it, and one that has none
 * follows the project's brand kit (`captionStyleOf` — the kit's preset in
 * its own font and colours, docs/app-spec/DIRECTOR-BRAND.md § The caption
 * style of a kit). Nothing here reads the request: that is `captionsLook.js`.
 * @module api/director/inplace/captionsStyle
 */

import { captionStyleOf } from '#utils/brand/index.js';
import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { resolveCaptionStyle } from '#utils/captions/resolve.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { kitName, kitOf } from '../brand/kit.js';

/**
 * @typedef {Object} CaptionStyleChoice
 * @property {'asked'|'timeline'|'brand'} from - Whose style it is: the
 *   request's, the timeline's own, or the brand kit's
 * @property {string} label - The look's name, as the interface says it
 * @property {string} said - The same for a summary: with where it comes from
 *   when nobody named it
 * @property {Record<string, any>|null} style - What the document is to
 *   store (`setCaptionStyle`); null = it keeps what it has
 * @property {any[]} fonts - The kit's own font files the style is set in
 *   (`document.fonts`)
 * @property {string} note - Why this look, for the person; '' when the
 *   request named it
 */

/**
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {{ preset: string }} look - What the request asks for (`chooseLook`);
 *   `preset` '' = no look
 * @returns {CaptionStyleChoice}
 */
export function captionStyleFor(ctx, look) {
  const own = ctx.edl.captions?.style;
  const current = resolveCaptionStyle(own).preset;
  const labelOf = (/** @type {string} */ preset) => CAPTION_PRESETS[preset]?.label || preset;
  if (look.preset) {
    const label = labelOf(look.preset);
    // The look the timeline already has is kept as it is, fine-tuning included.
    const style = look.preset === current ? null : { preset: look.preset };
    return { from: 'asked', label, said: label, style, fonts: [], note: '' };
  }
  if (isPlainObject(own)) {
    const label = labelOf(current);
    const note = `No look was asked for: the timeline keeps the caption style it has (${label}).`;
    return { from: 'timeline', label, said: label, style: null, fonts: [], note };
  }
  const kit = kitOf(ctx);
  const style = captionStyleOf(kit);
  const label = labelOf(style.preset);
  const family = String(style.font?.family || '');
  const fonts = (kit.fonts || []).filter(
    (/** @type {any} */ face) => String(face.family).toLowerCase() === family.toLowerCase(),
  );
  const note =
    'No look was asked for and the timeline had no caption style of its own, so the captions ' +
    `follow the project’s brand kit “${kitName(kit)}”: ${label}${family ? `, set in ${family}` : ''}.`;
  return { from: 'brand', label, said: `${label}, from the brand kit`, style, fonts, note };
}
