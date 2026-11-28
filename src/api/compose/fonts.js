/**
 * Bundled fonts on the server canvas — register the very files the browser
 * loads through `/vendor/fonts/fonts.css`, with the same family, weight and
 * style each `@font-face` rule declares, so `fontString()` picks the same
 * face on both canvases. Node only.
 * @module api/compose/fonts
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts, setTextRenderer } from '@napi-rs/canvas';
import { isCustomFamily } from '#utils/brand/fontTable.js';
import { EMOJI_FAMILY } from '#utils/compose/fonts.js';

/** Where scripts/vendor-fonts.js puts the files and their list. */
export const FONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../vendor/fonts');

const require = createRequire(import.meta.url);

// Draw text the way Chrome does on this operating system (its font backend,
// text gamma and contrast) rather than the library's own portable way. With
// `textRendering: geometricPrecision`, which the compositor always sets, a
// title then comes out pixel for pixel as in a Chrome preview on the same
// OS. Process-wide, and must happen before the first canvas is created —
// which is why it sits at the top of the module every canvas user imports.
setTextRenderer('system');

/**
 * @typedef {{ family: string, style: string, weight: number, file: string }} FontFace
 */

/**
 * The file to register for a face. The numbered WOFF2 subsets of
 * @fontsource/noto-color-emoji draw nothing — in Chrome as on the server:
 * WOFF2 drops the bounding boxes of glyphs without outlines, which is all a
 * COLRv1 glyph has to say how big it is. The package's WOFF files are
 * intact, so one is used when it can be found (beside the vendored file, or
 * in the package itself).
 * @param {string} dir
 * @param {FontFace} face
 * @returns {string} Absolute path
 */
export function fontFile(dir, face) {
  const file = join(dir, face.file);
  if (face.family !== EMOJI_FAMILY || !file.endsWith('.woff2')) return file;
  const woff = `${basename(file, '.woff2')}.woff`;
  const beside = join(dirname(file), woff);
  if (existsSync(beside)) return beside;
  try {
    const pkg = dirname(require.resolve(`@fontsource/${dirname(face.file)}/package.json`));
    const packaged = join(pkg, 'files', woff);
    return existsSync(packaged) ? packaged : file;
  } catch {
    return file; // the package is not installed: the vendored file is all there is
  }
}

/** @type {{ registered: number, failed: string[] } | null} */
let done = null;

/**
 * Register every bundled face with the server canvas. Safe to call often:
 * the work happens once per process.
 *
 * Each face is registered with its weight and style. Without them the
 * canvas treats all files of a family as the same face and uses whichever
 * came last — every weight would draw as the heaviest.
 * @param {string} [dir] - Folder holding `fonts.json` and the font files
 * @returns {{ registered: number, failed: string[] }} `failed` lists files
 *   that could not be registered
 */
export function registerFonts(dir = FONT_DIR) {
  if (done && dir === FONT_DIR) return done;
  const list = join(dir, 'fonts.json');
  const result = { registered: 0, failed: /** @type {string[]} */ ([]) };
  if (!existsSync(list)) {
    console.warn(`[compose] no bundled fonts at ${list} — run "npm install" to vendor them`);
  } else {
    /** @type {FontFace[]} */
    const faces = JSON.parse(readFileSync(list, 'utf-8'));
    for (const face of faces) {
      const file = fontFile(dir, face);
      const descriptors = { weight: face.weight, style: /** @type {any} */ (face.style) };
      if (existsSync(file) && GlobalFonts.registerFromPath(file, face.family, descriptors)) {
        result.registered++;
      } else {
        result.failed.push(face.file);
      }
    }
    if (result.failed.length) {
      console.warn(
        `[compose] ${result.failed.length} bundled font file(s) could not be registered`,
      );
    }
  }
  if (dir === FONT_DIR) done = result;
  return result;
}

/** @type {Map<string, { file: string, key: any }>} A document's faces by family, weight and style */
const own = new Map();
/** @type {WeakSet<object>} Font tables that have been gone through */
const seen = new WeakSet();

/**
 * Register a document's own font files (`edl.fonts`) under their family
 * names, with the weight and style the table gives each. **The caller
 * decides which files may be read** — pass only paths that have been
 * through the allow-list. A table that was seen costs nothing; a face that
 * comes with another file than before is replaced; a file that is missing
 * or cannot be used is reported once, and text in that family is then
 * drawn in the bundled sans-serif (`fontString` names it as the fallback).
 * @param {any[]} faces - `[{ family, weight, style, file }]`
 * @returns {string[]} Files that could not be registered in this call
 */
export function registerDocumentFonts(faces) {
  if (!Array.isArray(faces) || seen.has(faces)) return [];
  seen.add(faces);
  registerFonts();
  /** @type {string[]} */
  const failed = [];
  for (const face of faces) {
    // A bundled family is never redefined: both canvases must keep drawing it alike.
    if (!face || !isCustomFamily(face.family) || typeof face.file !== 'string') continue;
    const style = face.style === 'italic' ? 'italic' : 'normal';
    const weight = Number.isFinite(face.weight) ? face.weight : 400;
    const id = `${face.family.toLowerCase()}|${weight}|${style}`;
    const before = own.get(id);
    if (before?.file === face.file) continue;
    if (before?.key) GlobalFonts.remove(before.key);
    const descriptors = { weight, style: /** @type {any} */ (style) };
    const key = existsSync(face.file)
      ? GlobalFonts.registerFromPath(face.file, face.family, descriptors)
      : null;
    own.set(id, { file: face.file, key });
    if (key) continue;
    failed.push(face.file);
    console.warn(
      `[compose] could not load font file ${face.file}: "${face.family}" is drawn in the fallback font`,
    );
  }
  return failed;
}
