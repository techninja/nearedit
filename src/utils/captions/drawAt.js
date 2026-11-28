/**
 * Captions in one call — what a compositor needs: the words of a voice, a
 * time, the timeline's style and the canvas. Groups are remembered per
 * words and style; everything else is worked out for the frame.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/drawAt
 */

import { captionAt } from './at.js';
import { drawCaption } from './draw.js';
import { fontOf } from './metrics.js';
import { captionGroups } from './groups.js';
import { layoutCaption } from './layout.js';
import { resolveCaptionStyle } from './resolve.js';

/** Longest sample of a voice's characters handed to a font loader. */
const MAX_SAMPLE = 400;

/**
 * The canvas `font` value captions are measured in: the style's font at
 * the style's size on this canvas. `layoutCaption`'s `measure` must report
 * widths in it.
 * @param {unknown} style - A stored or resolved caption style
 * @param {import('./types.js').CaptionFrame} frame
 * @returns {string} e.g. `700 56.16px "Inter", "Noto Color Emoji"`
 */
export function captionFont(style, frame) {
  return fontOf(resolveCaptionStyle(style), frame);
}

/**
 * What a host must have loaded before captions can be measured and drawn:
 * the font, and the characters it will be asked for (each once), in the
 * shape `requirements(edl).fonts` uses.
 * @param {unknown} words - The words of a voice
 * @param {unknown} style
 * @param {any[]} [fonts] - The document's own fonts (`edl.fonts`)
 * @returns {{ font: string, text: string }}
 */
export function captionFontNeed(words, style, fonts) {
  const resolved = resolveCaptionStyle(style);
  const chars = new Set();
  for (const group of captionGroups(words, resolved)) {
    for (const char of group.text) if (chars.size < MAX_SAMPLE) chars.add(char);
  }
  chars.delete('\n');
  const frame = { width: 100, height: 100, fonts };
  return { font: fontOf(resolved, frame, 100), text: [...chars].join('') };
}

/**
 * Draw the caption of one voice at a time: find the group on screen, lay
 * it out measuring with the context, and draw it. Deterministic, and
 * nothing is kept between frames but the groups.
 * @param {any} ctx - A Canvas 2D context (browser or server); it is left as it was
 * @param {unknown} words - The voice's words, `[start, end, text]`
 * @param {number} time - Seconds, in the time base of the words
 * @param {unknown} style - The timeline's caption style, stored or resolved
 * @param {import('./types.js').CaptionFrame} frame - The canvas being drawn
 * @param {number} [lane=0] - 0 for the first voice sounding at this
 *   moment, 1 for a second one, which is then stacked clear of the first
 * @returns {boolean} True when a caption was drawn
 */
export function drawCaptionAt(ctx, words, time, style, frame, lane = 0) {
  const resolved = resolveCaptionStyle(style);
  const found = captionAt(captionGroups(words, resolved), time);
  if (!found || !(frame?.width > 0 && frame?.height > 0)) return false;
  ctx.save();
  ctx.textRendering = 'geometricPrecision';
  ctx.letterSpacing = '0px';
  ctx.font = fontOf(resolved, frame);
  const measure = (/** @type {string} */ text) => ctx.measureText(text).width;
  const laid = layoutCaption(found.group, { ...found, lane }, resolved, frame, measure);
  ctx.restore();
  drawCaption(ctx, laid, resolved, frame);
  return Boolean(laid);
}
