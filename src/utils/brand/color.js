/**
 * Colour arithmetic for brand kits: how bright a colour is, how well two
 * colours read against each other (WCAG 2 contrast), and which of black and
 * white to write with on a given ground. Colours are hex strings
 * (`#rrggbb`, `#rrggbbaa`). Isomorphic and pure.
 * @module utils/brand/color
 */

import { isHex, parseColor } from '#utils/compose/color.js';

/** The two inks a derived "on" colour chooses between. */
export const INKS = Object.freeze({ dark: '#000000', light: '#ffffff' });

/** Contrast below which text on a ground is reported as hard to read. */
export const MIN_CONTRAST = 4.5;

/**
 * Relative luminance of a colour (alpha ignored).
 * @param {unknown} color
 * @returns {number} 0 (black) … 1 (white); 0 for anything that is not a colour
 */
export function luminance(color) {
  const [r, g, b] = parseColor(color).map((channel, i) => {
    if (i === 3) return 0;
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio of two colours.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} 1 (the same brightness) … 21 (black on white)
 */
export function contrastRatio(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

/**
 * The ink that reads on a ground: black or white, whichever contrasts more.
 * @param {unknown} ground
 * @returns {string} `#000000` or `#ffffff`
 */
export function readableOn(ground) {
  return contrastRatio(INKS.dark, ground) > contrastRatio(INKS.light, ground)
    ? INKS.dark
    : INKS.light;
}

/**
 * @param {unknown} ink
 * @param {unknown} ground
 * @param {number} [least] - The ratio wanted
 * @returns {boolean} True when `ink` reads on `ground`
 */
export function isReadable(ink, ground, least = MIN_CONTRAST) {
  return contrastRatio(ink, ground) >= least;
}

/**
 * A colour with another opacity: `#rrggbb` + alpha → `#rrggbbaa`.
 * @param {unknown} color
 * @param {number} alpha - 0..1
 * @returns {string} The colour itself when it is not a hex colour
 */
export function withOpacity(color, alpha) {
  if (!isHex(color)) return String(color ?? '');
  const [r, g, b] = parseColor(color);
  const hex = (/** @type {number} */ v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${hex(alpha * 255)}`;
}
