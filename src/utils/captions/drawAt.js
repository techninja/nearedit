/**
 * Captions in one call — what a compositor needs: the words of a voice, a
 * time, the timeline's style and the canvas. Groups are remembered per
 * words and style; everything else is worked out for the frame.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/drawAt
 */

import { captionAt } from './at.js';
import { drawCaption } from './draw.js';
import { placeWords } from './geometry.js';
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
 * Run something that measures text in a style's font on a context.
 * @template T
 * @param {any} ctx - A Canvas 2D context; it is left as it was
 * @param {import('./types.js').CaptionStyle} style - Resolved
 * @param {import('./types.js').CaptionFrame} frame
 * @param {(measure: (text: string) => number) => T} use
 * @returns {T}
 */
function measuring(ctx, style, frame, use) {
  ctx.save();
  ctx.textRendering = 'geometricPrecision';
  ctx.letterSpacing = '0px';
  ctx.font = fontOf(style, frame);
  const result = use((text) => ctx.measureText(text).width);
  ctx.restore();
  return result;
}

/**
 * Where a group sits at rest in a frame, measured with a context: what a
 * compositor asks before it decides whether the group has to make room for
 * something (`room.js`). Give it a frame of the output's own size and the
 * answer is the same on a small preview and on the render.
 * @param {any} ctx - A Canvas 2D context (browser or server); it is left as it was
 * @param {import('./types.js').CaptionGroup} group - From `captionGroups`
 * @param {unknown} style - The timeline's caption style, stored or resolved
 * @param {import('./types.js').CaptionFrame} frame
 * @param {number} [lane=0]
 * @returns {ReturnType<typeof placeWords>}
 */
export function placeCaption(ctx, group, style, frame, lane = 0) {
  const resolved = resolveCaptionStyle(style);
  return measuring(ctx, resolved, frame, (measure) =>
    placeWords(group, resolved, frame, measure, lane),
  );
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
 * @param {number} [lift=0] - Units the group sits lower by (negative:
 *   higher) to be clear of something in its way (`liftFor`)
 * @returns {boolean} True when a caption was drawn
 */
export function drawCaptionAt(ctx, words, time, style, frame, lane = 0, lift = 0) {
  const resolved = resolveCaptionStyle(style);
  const found = captionAt(captionGroups(words, resolved), time);
  if (!found || !(frame?.width > 0 && frame?.height > 0)) return false;
  const laid = measuring(ctx, resolved, frame, (measure) =>
    layoutCaption(found.group, { ...found, lane, lift }, resolved, frame, measure),
  );
  drawCaption(ctx, laid, resolved, frame);
  return Boolean(laid);
}
