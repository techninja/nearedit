/**
 * Colour arithmetic for motion pieces: blending two hex colours, and the
 * contrast between a colour and its ground, which is how a theme's type is
 * known to be readable on its backdrops.
 * Isomorphic and pure.
 * @module utils/director/motion/color
 */

/**
 * @param {string} hex - `#rrggbb`
 * @returns {[number, number, number]} Channels 0..255
 */
export function channels(hex) {
  const value = parseInt(String(hex).slice(1, 7), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * A colour part of the way from one to another.
 * @param {string} from - `#rrggbb`
 * @param {string} to - `#rrggbb`
 * @param {number} share - 0 = `from`, 1 = `to`
 * @returns {string} `#rrggbb`
 */
export function mix(from, to, share) {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((channel, i) =>
      Math.round(channel + (b[i] - channel) * share)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Relative luminance (WCAG 2).
 * @param {string} hex - `#rrggbb`
 * @returns {number} 0 (black) .. 1 (white)
 */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio between two colours (WCAG 2): 1 = the same, 21 = black on
 * white. Text wants 4.5 or more; large display type gets by with 3.
 * @param {string} a - `#rrggbb`
 * @param {string} b - `#rrggbb`
 * @returns {number}
 */
export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
