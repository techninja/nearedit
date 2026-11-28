/**
 * Colour arithmetic for themes: blending two colours, nudging one until it
 * reads on its ground, choosing an ink for several grounds, the neutral grey
 * as bright as a colour. Colours are opaque `#rrggbb` strings; contrast and
 * luminance are the brand kits' (`#utils/brand/color.js`). Isomorphic and pure.
 * @module utils/theme/color
 */

import { contrastRatio, luminance } from '#utils/brand/color.js';
import { parseColor } from '#utils/compose/color.js';

const OPAQUE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BLACK = '#000000';
const WHITE = '#ffffff';

/**
 * @param {number} r - 0..255
 * @param {number} g - 0..255
 * @param {number} b - 0..255
 * @returns {string} `#rrggbb`
 */
export function toHex(r, g, b) {
  const pair = (/** @type {number} */ v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/**
 * A role's colour as the model keeps it.
 * @param {unknown} value - `#rgb` or `#rrggbb`, any case
 * @returns {string} Lower-case `#rrggbb`; '' for anything else (a role is
 *   opaque: a colour with alpha is not one)
 */
export function cleanColor(value) {
  if (typeof value !== 'string' || !OPAQUE_HEX.test(value.trim())) return '';
  const [r, g, b] = parseColor(value.trim());
  return toHex(r, g, b);
}

/**
 * Blend two colours.
 * @param {string} from
 * @param {string} to
 * @param {number} amount - 0 gives `from`, 1 gives `to`
 * @returns {string}
 */
export function mix(from, to, amount) {
  const [a, b] = [parseColor(from), parseColor(to)];
  const k = Math.max(0, Math.min(1, amount));
  return toHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

/**
 * A colour seen through: what CSS and a canvas both take.
 * @param {string} color
 * @param {number} percent - Opacity, 0..100
 * @returns {string} `rgb(r g b / p%)`
 */
export function translucent(color, percent) {
  const [r, g, b] = parseColor(color);
  return `rgb(${r} ${g} ${b} / ${Math.round(percent)}%)`;
}

/**
 * The grey that is as bright as a colour: a surround that does not tint
 * the picture it frames.
 * @param {string} color
 * @returns {string}
 */
export function neutral(color) {
  const light = luminance(color);
  const channel = light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055;
  return toHex(channel * 255, channel * 255, channel * 255);
}

/**
 * @param {string} ink
 * @param {string[]} grounds
 * @returns {number} The contrast on the ground it reads worst on
 */
export function worstContrast(ink, grounds) {
  return Math.min(...grounds.map((ground) => contrastRatio(ink, ground)));
}

/**
 * A colour moved towards black or white — whichever its grounds are
 * furthest from — until it reads on every one of them. Its hue stays.
 * @param {string} color
 * @param {string[]} grounds
 * @param {number} least - The contrast wanted
 * @returns {string} The colour itself when it reads already; black or white
 *   when nothing in between does
 */
export function readable(color, grounds, least) {
  if (!grounds.length || worstContrast(color, grounds) >= least) return color;
  const pole = worstContrast(WHITE, grounds) >= worstContrast(BLACK, grounds) ? WHITE : BLACK;
  for (let amount = 0.04; amount < 1; amount += 0.04) {
    const moved = mix(color, pole, amount);
    if (worstContrast(moved, grounds) >= least) return moved;
  }
  return pole;
}

/**
 * The ink that reads best across several grounds.
 * @param {string[]} grounds
 * @param {string[]} inks - Candidates, in order of preference
 * @returns {string} The one whose worst contrast is highest
 */
export function inkFor(grounds, inks) {
  let best = inks[0];
  for (const ink of inks) {
    if (worstContrast(ink, grounds) > worstContrast(best, grounds) + 0.01) best = ink;
  }
  return best;
}

/**
 * A step away from the ground, as a hovered fill takes: lighter in a dark
 * theme, darker in a light one.
 * @param {string} color
 * @param {'light'|'dark'} scheme
 * @returns {string}
 */
export function hovered(color, scheme) {
  return scheme === 'dark' ? mix(color, WHITE, 0.2) : mix(color, BLACK, 0.15);
}
