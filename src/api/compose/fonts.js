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
