/**
 * Bundled fonts — the families every NearEdit install can draw text with,
 * in the browser preview and in the server render alike. The files are
 * vendored from @fontsource packages by scripts/vendor-fonts.js; both sides
 * load those same files, which is what keeps text identical between them.
 * A document may bring font files of its own (its `fonts` table, see
 * `fontFaces.js`); a family named there is found before the bundled ones.
 * Isomorphic and pure (data and string helpers only).
 * @module utils/compose/fonts
 */

import { customFamily } from './fontFaces.js';

/**
 * @typedef {Object} FontFamily
 * @property {string} id - CSS family name, as stored in `text.fontFamily`
 * @property {string} label
 * @property {'sans-serif'|'serif'|'monospace'|'display'|'handwriting'} generic
 * @property {number[]} weights - Available weights
 * @property {boolean} italics - Italic faces are bundled
 * @property {number[]} [italicWeights] - Weights that have an italic face,
 *   when not all of them do
 * @property {boolean} [custom] - It comes from a document's own font files
 */

/** @type {FontFamily[]} */
export const FONT_FAMILIES = [
  {
    id: 'Inter',
    label: 'Inter',
    generic: 'sans-serif',
    weights: [400, 700, 900],
    italics: true,
    italicWeights: [400, 700],
  },
  {
    id: 'Playfair Display',
    label: 'Playfair Display',
    generic: 'serif',
    weights: [400, 700, 900],
    italics: true,
    italicWeights: [400, 700],
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
 * The family for a stored `fontFamily`: one of the document's own when its
 * font table names it, otherwise a bundled one. Accepts a family id, or one
 * of the generic names older documents use (`sans-serif`, `serif`,
 * `monospace`); anything unknown falls back to the sans-serif family.
 * @param {string} name
 * @param {any[]} [fonts] - The document's font table
 * @returns {FontFamily}
 */
export function resolveFamily(name, fonts) {
  const wanted = String(name || '').toLowerCase();
  return (
    customFamily(fonts, wanted) ||
    FONT_FAMILIES.find((f) => f.id.toLowerCase() === wanted) ||
    FONT_FAMILIES.find((f) => f.generic === wanted) ||
    FONT_FAMILIES[0]
  );
}

/**
 * The nearest bundled weight of a family.
 * @param {FontFamily} family
 * @param {number} weight
 * @param {boolean} [italic=false] - Choose among the weights that have an italic face
 * @returns {number}
 */
export function nearestWeight(family, weight, italic = false) {
  const weights = (italic && family.italicWeights) || family.weights;
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}

/**
 * A canvas `font` value for a text style. It always names a face there is
 * a file for — a weight the family has, italic only where an italic file
 * exists — so neither canvas has to synthesise or substitute one, which the
 * browser and the server would do differently. A family of the document's
 * own is followed by the bundled sans-serif: what its file lacks, or all of
 * it when the file is missing, is drawn the same on both canvases.
 * @param {{ fontFamily?: string, fontSize?: number, bold?: boolean, italic?: boolean,
 *   weight?: number, fonts?: any[] }} style - `fonts`: the document's font
 *   table, as `textStyle` passes it on
 * @param {number} [scale=1] - Canvas pixels per output pixel
 * @returns {string} e.g. `italic 700 36px "Inter", "Noto Color Emoji"`
 */
export function fontString(style, scale = 1) {
  const family = resolveFamily(style.fontFamily, style.fonts);
  const italic = Boolean(style.italic && family.italics);
  const weight = nearestWeight(family, style.weight || (style.bold ? 700 : 400), italic);
  const slant = italic ? 'italic ' : '';
  const size = Math.max(1, (style.fontSize || 72) * scale);
  const fallback = family.custom ? `, "${FONT_FAMILIES[0].id}"` : '';
  return `${slant}${weight} ${size}px "${family.id}"${fallback}, "${EMOJI_FAMILY}"`;
}
