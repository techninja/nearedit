/**
 * The enumerations in force in one document. A document may bring fonts of
 * its own (`edl.fonts`); its titles may then name those families as well
 * as the bundled ones. Isomorphic and pure.
 * @module utils/edl/fontEnums
 */

import { customFamilyNames } from '#utils/compose/fontFaces.js';
import { ENUMS, FONTS } from './sanitize.js';

/** @typedef {import('./sanitize.js').Enums} Enums */

/** @type {WeakMap<object, Enums>} */
const withFonts = new WeakMap();

/**
 * The enumerations in force in a document: `ENUMS`, with the families of
 * the document's own font table (`edl.fonts`) allowed as `fontFamily`.
 * @param {any[]|undefined} fonts
 * @returns {Enums} `ENUMS` itself for a document without fonts of its own
 */
export function fontEnums(fonts) {
  if (!Array.isArray(fonts) || !fonts.length) return ENUMS;
  if (!withFonts.has(fonts)) {
    withFonts.set(fonts, { ...ENUMS, fontFamily: [...FONTS, ...customFamilyNames(fonts)] });
  }
  return withFonts.get(fonts);
}
