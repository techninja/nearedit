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
import { isPlainObject, sameJson } from '#utils/edl/jsonBag.js';

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
 * A merge gives every marker of a result a new id. Markers that came back
 * as they were — the same times, labels and colours — keep the ids they had.
 * @param {Edl} before
 * @param {Edl} next
 * @returns {Edl}
 */
function keepMarkers(before, next) {
  const [had, has] = [before.markers || [], next.markers || []];
  const same =
    had.length === has.length &&
    had.every(
      (m, i) => m.time === has[i].time && m.label === has[i].label && m.color === has[i].color,
    );
  return same && had.length ? { ...next, markers: had } : next;
}

/**
 * Merge a director result into a document, document parts included.
 * @param {Edl} edl
 * @param {any} result - A DirectorResult, perhaps with `document`
 * @returns {Edl} A document that satisfies `validateEdl` — the document that
 *   came in, itself, when the result changes nothing about it (a brand pass
 *   run a second time): there is then nothing to commit, and nothing to undo
 */
export function applyDirected(edl, result) {
  if (!isPlainObject(result)) return edl;
  const parts = isPlainObject(result.document) ? result.document : {};
  // The font files first: titles of the fragment may then name their families.
  let next = applyDirectorResult(withFonts(edl, parts.fonts), result);
  if (isPlainObject(parts.captions) && parts.captions.style !== undefined) {
    next = setCaptionStyle(next, parts.captions.style);
  }
  if (Array.isArray(parts.regions)) next = { ...next, regions: parts.regions };
  next = keepMarkers(edl, next);
  return sameJson(next, edl) ? edl : next;
}
