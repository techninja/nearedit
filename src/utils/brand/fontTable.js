/**
 * Font tables — the list of font files a kit brings, an element needs or a
 * document names: `[{ family, weight, style, file }]`. A family that is
 * bundled with NearEdit can not be redefined (the two would draw
 * differently on the browser and on the server canvas), so such an entry is
 * left out. Isomorphic and pure. Contract: docs/app-spec/BRAND.md.
 * @module utils/brand/fontTable
 */

import { EMOJI_FAMILY, FONT_FAMILIES } from '#utils/compose/fonts.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS } from './limits.js';

/**
 * One font file.
 * @typedef {Object} FontFace
 * @property {string} family - The name text styles use
 * @property {number} weight - 1..1000
 * @property {'normal'|'italic'} style
 * @property {string} file - Path of a `.woff2`, `.woff`, `.ttf` or `.otf` file
 */

/** File types a font may come in. */
export const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;

const RESERVED = new Set(
  [...FONT_FAMILIES.flatMap((family) => [family.id, family.generic]), EMOJI_FAMILY].map((name) =>
    name.toLowerCase(),
  ),
);

/**
 * @param {unknown} family
 * @returns {boolean} True for a name a font file may be given: not empty,
 *   not too long, without quotes, and not one of the bundled families
 */
export function isCustomFamily(family) {
  if (typeof family !== 'string' || !family.trim() || family.length > LIMITS.family) return false;
  return !/["'\\\n]/.test(family) && !RESERVED.has(family.trim().toLowerCase());
}

/**
 * @param {{ family: string, weight: number, style: string }} face
 * @returns {string} What makes a face the same face: family, weight, style
 */
export const faceKey = (face) => `${face.family.toLowerCase()}|${face.weight}|${face.style}`;

/**
 * Read one entry.
 * @param {any} raw
 * @returns {FontFace|null} null for an entry that cannot be used
 */
export function cleanFace(raw) {
  if (!isPlainObject(raw) || !isCustomFamily(raw.family)) return null;
  const { file } = raw;
  if (typeof file !== 'string' || file.length > LIMITS.path || !FONT_FILE.test(file)) return null;
  const weight = Number.isFinite(raw.weight) ? Math.round(raw.weight) : 400;
  return {
    family: raw.family.trim(),
    weight: Math.max(1, Math.min(1000, weight)),
    style: raw.style === 'italic' ? 'italic' : 'normal',
    file,
  };
}

/**
 * Read a font table: usable entries, each face once (the first wins).
 * @param {any} raw
 * @returns {FontFace[]}
 */
export function cleanFonts(raw) {
  /** @type {Map<string, FontFace>} */
  const faces = new Map();
  for (const entry of Array.isArray(raw) ? raw.slice(0, LIMITS.fonts * 4) : []) {
    const face = cleanFace(entry);
    if (face && !faces.has(faceKey(face)) && faces.size < LIMITS.fonts) {
      faces.set(faceKey(face), face);
    }
  }
  return [...faces.values()];
}

/**
 * Join font tables; a face named by several keeps the entry of the first.
 * @param {...(FontFace[]|undefined)} tables
 * @returns {FontFace[]}
 */
export function mergeFonts(...tables) {
  return cleanFonts(tables.flatMap((table) => table || []));
}

/**
 * @param {FontFace[]|undefined} a
 * @param {FontFace[]|undefined} b
 * @returns {boolean} True when two tables list the same files in the same order
 */
export function sameFonts(a, b) {
  const [x, y] = [a || [], b || []];
  return (
    x.length === y.length &&
    x.every((face, i) => faceKey(face) === faceKey(y[i]) && face.file === y[i].file)
  );
}
