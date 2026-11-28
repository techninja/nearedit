/**
 * Measuring text for a layout. A host that draws gives `expandElement` its
 * own `measure` — the compositor measures on its canvas with the fonts it
 * draws with, so what is laid out is what is drawn. Without one (an edit
 * made where there is no canvas) widths are **estimated**: every character
 * is taken to be a fixed share of the font size wide — 0.56 for the
 * bundled sans-serif, less for the condensed and the handwritten family,
 * 0.6 for the monospaced one — a capital or a digit a sixth wider, a space
 * or a narrow letter (`il.,:;'!|`) half as wide, heavier weights up to 8 %
 * wider. That is within a few percent for ordinary text and good enough to
 * choose line breaks; it is not what a renderer uses.
 * Isomorphic and pure.
 * @module utils/brand/element/measure
 */

import { graphemes } from '#utils/compose/text/wrap.js';

/** Average advance of a character as a share of the font size, weight 400. */
const ADVANCE = {
  inter: 0.56,
  'playfair display': 0.5,
  'jetbrains mono': 0.6,
  'bebas neue': 0.4,
  caveat: 0.4,
};
const NARROW = /[il.,:;'!|ftj()[\]]/;
const WIDE = /[A-Z0-9mwMW@%&]/;

/**
 * @typedef {{ fontFamily: string, fontSize: number, weight: number, italic: boolean,
 *   letterSpacing: number }} RunStyle
 * @typedef {(text: string, style: RunStyle) => number} MeasureRun - Width of
 *   a run of text in output pixels, letter spacing included
 */

/**
 * The documented estimate of a run's width.
 * @type {MeasureRun}
 */
export function estimateMeasure(text, style) {
  const family = String(style.fontFamily || '').toLowerCase();
  const fixed = family === 'jetbrains mono';
  const base = ADVANCE[family] ?? 0.55;
  const heavy = 1 + (Math.max(0, Math.min(500, (style.weight || 400) - 400)) / 500) * 0.08;
  let width = 0;
  let count = 0;
  for (const char of graphemes(String(text))) {
    count++;
    if (fixed) width += base;
    else if (char === ' ') width += base * 0.5;
    else width += base * (NARROW.test(char) ? 0.5 : WIDE.test(char) ? 1.17 : 1);
  }
  return width * heavy * style.fontSize + count * (style.letterSpacing || 0);
}

/**
 * The number a field holds, or a fallback: a reference that was never
 * filled in, or anything else that is not a finite number, is not one.
 * @param {any} value
 * @param {number} fallback
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function num(value, fallback, min = -Infinity, max = Infinity) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * A length written as units or as a share (`"80%"`) of something.
 * @param {any} value
 * @param {number} whole - What a percentage is taken of, pixels
 * @param {number} unit - Pixels per unit
 * @param {number} fallback - Pixels
 * @returns {number} Pixels
 */
export function lengthOf(value, whole, unit, fallback) {
  if (typeof value === 'string' && value.endsWith('%')) {
    const share = Number(value.slice(0, -1));
    return Number.isFinite(share) ? (whole * Math.max(0, share)) / 100 : fallback;
  }
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) * unit : fallback;
}

/**
 * A padding written as one number or as `[x, y]`, in pixels.
 * @param {any} pad
 * @param {number} unit - Pixels per unit
 * @returns {[number, number]}
 */
export function padOf(pad, unit) {
  const pair = Array.isArray(pad) ? pad : [pad, pad];
  return [num(pair[0], 0, 0, 100) * unit, num(pair[1], 0, 0, 100) * unit];
}
