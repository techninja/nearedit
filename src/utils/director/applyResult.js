/**
 * Putting a director result on a timeline, with the parts of it that are
 * not clips. A `DirectorResult` is tracks and markers (API.md); a result
 * that follows a brand may also carry `document`: font files its titles and
 * captions are set in, the caption style of the timeline, and regions that
 * moved with a ripple. `applyDirected` is `applyDirectorResult` with those
 * applied in the same step — so the director's work is still one document
 * change, and one undo.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The result. Isomorphic and pure.
 * @module utils/director/applyResult
 */

import { cleanFonts, mergeFonts, sameFonts } from '#utils/brand/fontTable.js';
import { applyDirectorResult, setCaptionStyle } from '#utils/edl/index.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * The document parts of a result.
 * @typedef {Object} ResultDocument
 * @property {import('#utils/brand/fontTable.js').FontFace[]} [fonts] - Font
 *   files to list in the document's font table (`edl.fonts`)
 * @property {{ style: unknown }} [captions] - The timeline's caption style
 * @property {any[]} [regions] - The document's regions, as they are after the result
 */

/**
 * List font files in a document's own font table; a face it already lists
 * keeps its place and takes the new file.
 * @param {Edl} edl
 * @param {unknown} fonts - `[{ family, weight, style, file }]`
 * @returns {Edl} The same document when its table already says this
 */
export function withFonts(edl, fonts) {
  const faces = cleanFonts(fonts);
  if (!faces.length) return edl;
  const merged = mergeFonts(faces, edl.fonts || []);
  return sameFonts(merged, edl.fonts) ? edl : /** @type {Edl} */ ({ ...edl, fonts: merged });
}

/**
 * Merge a director result into a document, document parts included.
 * @param {Edl} edl
 * @param {any} result - A DirectorResult, perhaps with `document`
 * @returns {Edl} A document that satisfies `validateEdl`
 */
export function applyDirected(edl, result) {
  const parts = isPlainObject(result?.document) ? result.document : {};
  // The font files first: titles of the fragment may then name their families.
  let next = applyDirectorResult(withFonts(edl, parts.fonts), result);
  if (isPlainObject(parts.captions) && parts.captions.style !== undefined) {
    next = setCaptionStyle(next, parts.captions.style);
  }
  if (Array.isArray(parts.regions)) next = { ...next, regions: parts.regions };
  return next;
}
