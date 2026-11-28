/**
 * The document's font table in step with its element clips. A design lists
 * the font files its text needs; the document lists the fonts it needs
 * that are not bundled (`edl.fonts`), which is what both hosts load. Every
 * operation that brings a design into a document, or replaces one, passes
 * the result through here. Isomorphic and pure.
 * @module utils/edl/elementFonts
 */

import { isElementClip } from '#utils/brand/clip.js';
import { faceKey, mergeFonts, sameFonts } from '#utils/brand/fontTable.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('#utils/brand/fontTable.js').FontFace} FontFace */

/**
 * @param {Edl} edl
 * @returns {{ faces: FontFace[], families: Set<string> }} The font files the
 *   designs of its element clips name, and every family its titles and
 *   designs are set in (lower case)
 */
function fontsInUse(edl) {
  /** @type {FontFace[]} */
  const faces = [];
  const families = new Set();
  const seen = new Set();
  for (const track of edl.tracks) {
    for (const clip of track.clips) {
      if (!isElementClip(clip)) {
        if (clip.text?.content) families.add(String(clip.text.fontFamily).toLowerCase());
        continue;
      }
      const { design } = clip.element;
      if (seen.has(design)) continue;
      seen.add(design);
      for (const face of design.fonts || []) {
        faces.push(face);
        families.add(face.family.toLowerCase());
      }
    }
  }
  return { faces, families };
}

/**
 * Bring `edl.fonts` in step with the element clips: every font file a
 * design names is listed — a design's file replaces an entry for the same
 * face — and of the `dropped` faces (those of designs that were just
 * replaced or taken out) the ones nothing uses any more are removed.
 * Entries nobody dropped are never removed: they may be the user's own.
 * @param {Edl} edl
 * @param {FontFace[]} [dropped]
 * @returns {Edl} The same document when its table already says this; a
 *   document without fonts of its own has no `fonts` field
 */
export function syncFonts(edl, dropped = []) {
  const { faces, families } = fontsInUse(edl);
  const gone = new Set(
    dropped.filter((face) => !families.has(face.family.toLowerCase())).map(faceKey),
  );
  const kept = (edl.fonts || []).filter((face) => !gone.has(faceKey(face)));
  const fonts = mergeFonts(faces, kept);
  if (sameFonts(fonts, edl.fonts)) return edl;
  /** @type {any} */
  const next = { ...edl, fonts };
  if (!fonts.length) delete next.fonts;
  return next;
}
