/**
 * Text style — a clip's `text` block with every field usable and every
 * default applied, so layout and drawing never guess. The defaults are the
 * look of a v2 title: lines pitched 1.2 × the font size, a background box
 * padded by a quarter of the font size, no shadow, no animation.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § text.
 * @module utils/compose/text/style
 */

import { cssColor, isHex } from '../color.js';
import { textAnimation } from './animation.js';

/** Line pitch as a multiple of the font size. */
export const TITLE_LINE_HEIGHT = 1.2;

/** Background box padding on every side, as a multiple of the font size. */
export const TITLE_BOX_PADDING = 0.25;

/**
 * All lengths are output pixels unless said otherwise.
 * @typedef {Object} TextStyle
 * @property {string} content - Line breaks are `\n`
 * @property {string} fontFamily
 * @property {number} fontSize
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {number} weight - 0 = from `bold`
 * @property {string} color
 * @property {string} background - '' = no box
 * @property {'left'|'center'|'right'} align
 * @property {string} outlineColor
 * @property {number} outlineWidth
 * @property {number} lineHeight - Multiple of the font size
 * @property {number} letterSpacing
 * @property {number} maxWidth - 0 = no wrapping
 * @property {number} boxPadding - Multiple of the font size
 * @property {number} boxRadius
 * @property {string} shadowColor
 * @property {number} shadowBlur
 * @property {number} shadowX
 * @property {number} shadowY
 * @property {import('./animation.js').TextAnimation} animateIn
 * @property {import('./animation.js').TextAnimation} animateOut
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number} `value` when it is a finite number
 */
const num = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Resolve a clip's `text` block.
 * @param {any} text
 * @returns {TextStyle}
 */
export function textStyle(text) {
  const raw = text || {};
  return {
    content: String(raw.content ?? '').replace(/\r\n?/g, '\n'),
    fontFamily: String(raw.fontFamily || 'sans-serif'),
    fontSize: raw.fontSize > 0 ? Number(raw.fontSize) : 72,
    bold: Boolean(raw.bold),
    italic: Boolean(raw.italic),
    weight: Math.max(0, num(raw.weight, 0)),
    color: cssColor(raw.color, '#ffffff'),
    background: isHex(raw.background) ? raw.background : '',
    align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
    outlineColor: cssColor(raw.outlineColor, '#000000'),
    outlineWidth: Math.max(0, num(raw.outlineWidth, 0)),
    lineHeight: raw.lineHeight > 0 ? Number(raw.lineHeight) : TITLE_LINE_HEIGHT,
    letterSpacing: num(raw.letterSpacing, 0),
    maxWidth: Math.max(0, num(raw.maxWidth, 0)),
    boxPadding: Math.max(0, num(raw.boxPadding, TITLE_BOX_PADDING)),
    boxRadius: Math.max(0, num(raw.boxRadius, 0)),
    shadowColor: cssColor(raw.shadowColor, '#000000'),
    shadowBlur: Math.max(0, num(raw.shadowBlur, 0)),
    shadowX: num(raw.shadowX, 0),
    shadowY: num(raw.shadowY, 0),
    animateIn: textAnimation(raw.animateIn),
    animateOut: textAnimation(raw.animateOut),
  };
}

/**
 * @param {TextStyle} style
 * @returns {boolean} True when the style casts a drop shadow
 */
export const hasShadow = (style) =>
  style.shadowBlur > 0 || style.shadowX !== 0 || style.shadowY !== 0;
