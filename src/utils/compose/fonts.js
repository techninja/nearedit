/**
 * Bundled fonts — the families every NearEdit install can draw text with,
 * in the browser preview and in the server render alike. The files are
 * vendored from @fontsource packages by scripts/vendor-fonts.js; both sides
 * load those same files, which is what keeps text identical between them.
 * Isomorphic and pure (data and string helpers only).
 * @module utils/compose/fonts
 */

/**
 * @typedef {Object} FontFamily
 * @property {string} id - CSS family name, as stored in `text.fontFamily`
 * @property {string} label
 * @property {'sans-serif'|'serif'|'monospace'|'display'|'handwriting'} generic
 * @property {number[]} weights - Available weights
 * @property {boolean} italics - Italic faces are bundled
 */

/** @type {FontFamily[]} */
export const FONT_FAMILIES = [
  { id: 'Inter', label: 'Inter', generic: 'sans-serif', weights: [400, 700, 900], italics: true },
  {
    id: 'Playfair Display',
    label: 'Playfair Display',
    generic: 'serif',
    weights: [400, 700, 900],
    italics: true,
  },
  {
    id: 'JetBrains Mono',
    label: 'JetBrains Mono',
    generic: 'monospace',
    weights: [400, 700],
    italics: false,
  },
  { id: 'Bebas Neue', label: 'Bebas Neue', generic: 'display', weights: [400], italics: false },
  { id: 'Caveat', label: 'Caveat', generic: 'handwriting', weights: [400, 700], italics: false },
];

/** Always appended as a fallback, so emoji draw in colour everywhere. */
export const EMOJI_FAMILY = 'Noto Color Emoji';

/** Where the vendored files, `fonts.css` and `fonts.json` are served from. */
export const FONTS_URL = '/vendor/fonts';

/**
 * The bundled family for a stored `fontFamily`. Accepts a family id, or one
 * of the generic names older documents use (`sans-serif`, `serif`,
 * `monospace`); anything unknown falls back to the sans-serif family.
 * @param {string} name
 * @returns {FontFamily}
 */
export function resolveFamily(name) {
  const wanted = String(name || '').toLowerCase();
  return (
    FONT_FAMILIES.find((f) => f.id.toLowerCase() === wanted) ||
    FONT_FAMILIES.find((f) => f.generic === wanted) ||
    FONT_FAMILIES[0]
  );
}

/**
 * The nearest bundled weight of a family.
 * @param {FontFamily} family
 * @param {number} weight
 * @returns {number}
 */
export function nearestWeight(family, weight) {
  return family.weights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  );
}

/**
 * A canvas `font` value for a text style.
 * @param {{ fontFamily?: string, fontSize?: number, bold?: boolean, italic?: boolean, weight?: number }} style
 * @param {number} [scale=1] - Canvas pixels per output pixel
 * @returns {string} e.g. `italic 700 36px "Inter", "Noto Color Emoji"`
 */
export function fontString(style, scale = 1) {
  const family = resolveFamily(style.fontFamily);
  const weight = nearestWeight(family, style.weight || (style.bold ? 700 : 400));
  const slant = style.italic && family.italics ? 'italic ' : '';
  const size = Math.max(1, (style.fontSize || 72) * scale);
  return `${slant}${weight} ${size}px "${family.id}", "${EMOJI_FAMILY}"`;
}
