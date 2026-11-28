/**
 * The measures of a caption: units to pixels, the font, how far in from an
 * edge it sits, the room it needs around its words and between them. All
 * results are canvas pixels.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/metrics
 */

import { fontString } from '#utils/compose/fonts.js';
import { POP } from './paint.js';

/**
 * @typedef {import('./types.js').CaptionStyle} CaptionStyle
 * @typedef {import('./types.js').CaptionFrame} CaptionFrame
 */

/** Proportions of a caption, as multiples of its font size. */
export const EM = Object.freeze({
  cap: 0.72, // height of a capital: lines are centred on the middle of it
  line: 1.22, // from one line to the next
  pillX: 0.26, // a pill reaches this far beyond its word, left and right
  pillHeight: 1.14,
  pillRadius: 0.24,
  underlineDrop: 0.27, // top of the underline below the baseline
  underlineHeight: 0.09,
});

/** Captions keep this far from the frame's sides and from its top and bottom, units. */
export const SAFE = Object.freeze({ x: 5, y: 3 });

/**
 * Canvas pixels per unit: a unit is a hundredth of the output's shorter side.
 * @param {CaptionFrame} frame
 * @returns {number}
 */
export function unitOf(frame) {
  const outWidth = frame?.outWidth || frame?.width || 0;
  const outHeight = frame?.outHeight || frame?.height || 0;
  const scale = frame?.scale || frame?.width / outWidth || 1;
  return (Math.min(outWidth, outHeight) / 100) * scale;
}

/**
 * How far in from the top or bottom edge a caption sits, canvas pixels: the
 * style's offset in units — and more in a frame taller than it is wide,
 * where the apps that show such a video put their own text and buttons
 * over its ends, most of them over the bottom. The offset grows by the
 * frame's proportions at the top and by their square at the bottom, so one
 * style sits an eighth of the way up a wide frame and a fifth of the way
 * up a 9:16 one.
 * @param {number} offset - Units
 * @param {CaptionFrame} frame
 * @param {'top'|'bottom'|string} [anchor='bottom']
 * @returns {number}
 */
export function reachOf(offset, frame, anchor = 'bottom') {
  const { width = 1, height = 1, outWidth, outHeight } = frame || {};
  const tall = Math.max(1, (outHeight || height) / (outWidth || width) || 1);
  return offset * unitOf(frame) * (anchor === 'top' ? tall : tall * tall);
}

/**
 * A font size to the thousandth of a pixel: what a canvas `font` value is
 * written with, so layout and drawing agree on it to the last digit.
 * @param {number} size - Canvas pixels
 * @returns {number}
 */
export const fontSize = (size) => Math.round(size * 1000) / 1000;

/**
 * The canvas `font` value of a style.
 * @param {CaptionStyle} style - Resolved
 * @param {CaptionFrame} frame
 * @param {number} [size] - Canvas pixels; the style's own size by default
 * @returns {string} e.g. `700 56.16px "Inter", "Noto Color Emoji"`
 */
export function fontOf(style, frame, size = fontSize(style.size * unitOf(frame))) {
  const { family, weight } = style.font;
  return fontString({ fontFamily: family, weight, fontSize: size, fonts: frame?.fonts }, 1);
}

/**
 * How far around its words a caption needs room, canvas pixels: outline,
 * plate padding, and whatever the mark adds beside a word.
 * @param {CaptionStyle} style
 * @param {number} unit
 * @param {number} size - Font size, canvas pixels
 * @returns {{ x: number, top: number, bottom: number }}
 */
export function roomOf(style, unit, size) {
  const { mode } = style.highlight;
  const pad = style.plate.on ? style.plate.padding * unit : 0;
  const stroke = style.stroke.width * unit;
  const beside = mode === 'box' ? EM.pillX * size : 0;
  const under = mode === 'underline' ? (EM.underlineDrop + EM.underlineHeight - 0.25) * size : 0;
  return {
    // A plate is wider than it is tall around its words.
    x: Math.max(stroke, beside) + (style.plate.on ? pad * 1.4 + 0.25 * size : 0),
    top: stroke + pad,
    bottom: Math.max(stroke, under) + pad,
  };
}

/**
 * How much of its own width a word gains at its biggest: while it is said
 * when the style marks it by size, or for the moment of a pop.
 * @param {CaptionStyle} style
 * @returns {number} 0.12 for a word that grows to 1.12 times its size
 */
export function growthOf(style) {
  if (style.highlight.mode === 'scale') return style.highlight.scale - 1;
  return style.motion.word === 'pop' ? POP : 0;
}

/**
 * The space between two words of a line, canvas pixels: the font's own,
 * plus what the outlines take from it, plus room for the mark — a pill
 * reaches beyond its word, and a word that grows or pops needs room to
 * grow into.
 * @param {CaptionStyle} style
 * @param {number} unit
 * @param {number} size - Font size, canvas pixels
 * @param {number} space - Width of a space in the font
 * @param {number} wider - Width of the wider of the two words
 * @returns {number}
 */
export function gapOf(style, unit, size, space, wider) {
  const { mode } = style.highlight;
  // A word that stays big while it is said gets all the room it grows into
  // (half of its growth on this side); a pop is over in a moment and may
  // borrow a little of the space.
  const share = mode === 'scale' ? 0.5 : 0.4;
  const pill = mode === 'box' ? 0.6 * EM.pillX * size : 0;
  return space + 0.8 * style.stroke.width * unit + pill + share * growthOf(style) * wider;
}
