/**
 * A document's own fonts for a host that loads fonts through `FontFace`
 * objects (the browser). The font set is passed in — `document.fonts` — and
 * so is the making of a face, so this module stays free of globals.
 * Isomorphic. Contract: docs/app-spec/COMPOSITOR.md § Fonts.
 * @module utils/compose/fontRegistrar
 */

import { isCustomFamily } from '#utils/brand/fontTable.js';

/**
 * Create the `fonts(table)` of a host environment that loads fonts through
 * `FontFace` objects (the browser). Each face of a document's own font
 * table (`edl.fonts`) is added to the font set once, pointing at its file;
 * the loader above then loads it the first time text needs it. A table
 * that was seen costs nothing; a face that comes with another file than
 * before replaces the old one. A file that cannot be loaded is reported
 * once — its text is then drawn in the fallback family `fontString` names.
 * @param {any} fontSet - A FontFaceSet with `add()` and `delete()`
 * @param {(family: string, source: string, descriptors: object) => any} makeFace -
 *   `(family, source, descriptors) => new FontFace(family, source, descriptors)`
 * @param {(file: string) => string} urlOf - The URL a font file is read from
 * @param {() => void} [onChange] - Called when faces were added or replaced
 * @returns {(fonts: any[]) => void}
 */
export function createFontRegistrar(fontSet, makeFace, urlOf, onChange = () => {}) {
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();
  /** @type {Map<string, { file: string, face: any }>} */
  const added = new Map();
  return (fonts) => {
    if (!Array.isArray(fonts) || seen.has(fonts)) return;
    seen.add(fonts);
    let changed = false;
    for (const entry of fonts) {
      // A bundled family is never redefined: both canvases must keep drawing it alike.
      if (!entry || !isCustomFamily(entry.family) || typeof entry.file !== 'string') continue;
      const style = entry.style === 'italic' ? 'italic' : 'normal';
      const weight = Number.isFinite(entry.weight) ? entry.weight : 400;
      const key = `${entry.family.toLowerCase()}|${weight}|${style}`;
      const before = added.get(key);
      if (before?.file === entry.file) continue;
      if (before) fontSet.delete(before.face);
      const source = `url(${JSON.stringify(urlOf(entry.file))})`;
      const face = makeFace(entry.family, source, { weight: String(weight), style });
      face.loaded?.catch((/** @type {Error} */ err) =>
        console.warn(
          `[compose] could not load font file ${entry.file}: "${entry.family}" is drawn in the fallback font (${err?.message || err})`,
        ),
      );
      fontSet.add(face);
      added.set(key, { file: entry.file, face });
      changed = true;
    }
    if (changed) onChange();
  };
}
