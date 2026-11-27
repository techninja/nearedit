/**
 * Colours in the compositor. Documents store hex colours (`#rrggbb`, or
 * `#rrggbbaa` when keyframes blend alpha); canvases take them as they are.
 * These helpers make a stored value safe to hand to a canvas — a canvas
 * silently keeps its previous style when given a string it cannot parse —
 * and turn colours into numbers for code that computes pixels.
 * Isomorphic and pure.
 * @module utils/compose/color
 */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** @typedef {[number, number, number, number]} Rgba - Channels 0..255, alpha 0..1 */

/**
 * @param {unknown} value
 * @returns {boolean} True for `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`
 */
export const isHex = (value) => typeof value === 'string' && HEX.test(value);

/**
 * A colour a canvas will accept: the stored value when it is a hex colour,
 * the fallback otherwise.
 * @param {unknown} value
 * @param {string} [fallback='#000000']
 * @returns {string}
 */
export const cssColor = (value, fallback = '#000000') =>
  isHex(value) ? /** @type {string} */ (value) : fallback;

/**
 * Split a hex colour into channels.
 * @param {unknown} value
 * @param {Rgba} [fallback=[0, 0, 0, 1]]
 * @returns {Rgba}
 */
export function parseColor(value, fallback = [0, 0, 0, 1]) {
  if (!isHex(value)) return fallback;
  let hex = /** @type {string} */ (value).slice(1);
  if (hex.length < 6) hex = [...hex].map((ch) => ch + ch).join('');
  const channel = (i) => parseInt(hex.slice(i, i + 2), 16);
  return [channel(0), channel(2), channel(4), hex.length === 8 ? channel(6) / 255 : 1];
}

/**
 * A CSS colour string from channels.
 * @param {number} r - 0..255
 * @param {number} g - 0..255
 * @param {number} b - 0..255
 * @param {number} [a=1] - 0..1
 * @returns {string}
 */
export function rgba(r, g, b, a = 1) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${Math.max(0, Math.min(1, a))})`;
}

/**
 * A stored colour with its alpha multiplied — for fills that fade.
 * @param {unknown} value
 * @param {number} alpha - 0..1
 * @param {string} [fallback='#000000']
 * @returns {string} A CSS `rgba()` colour
 */
export function withAlpha(value, alpha, fallback = '#000000') {
  const [r, g, b, a] = parseColor(cssColor(value, fallback));
  return rgba(r, g, b, a * alpha);
}
