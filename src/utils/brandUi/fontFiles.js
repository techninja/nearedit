/**
 * The files a person brings to a kit: which ones a kit takes, and what a
 * font file is called — its family, weight and style, read from its name
 * (`AcmeSans-BoldItalic.woff2` → Acme Sans, 700, italic), since a browser
 * does not tell. Pure and isomorphic.
 * @module utils/brandUi/fontFiles
 */

import { FONT_FILE, isCustomFamily } from '#utils/brand/index.js';

/** What the file pickers accept. */
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif';
export const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf';
/** Largest file a kit takes, bytes (the server's limit). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const LOGO_FILE = /\.(png|jpe?g|webp|gif)$/i;

/** Words in a font file's name that say its weight, heaviest names first. */
const WEIGHTS = /** @type {[RegExp, number][]} */ ([
  [/(extra|ultra)[-_ ]?light/i, 200],
  [/(extra|ultra)[-_ ]?bold/i, 800],
  [/(semi|demi)[-_ ]?bold/i, 600],
  [/thin|hairline/i, 100],
  [/light/i, 300],
  [/medium/i, 500],
  [/black|heavy/i, 900],
  [/bold/i, 700],
  [/regular|normal|book|roman/i, 400],
]);

/**
 * @param {string} name - A file name
 * @param {'logo'|'font'} kind
 * @param {number} [size] - Bytes
 * @returns {string} Why the file cannot be used; '' when it can
 */
export function fileProblem(name, kind, size = 0) {
  const fits = kind === 'font' ? FONT_FILE.test(name) : LOGO_FILE.test(name);
  if (!fits) {
    return kind === 'font'
      ? 'A font must be a .woff2, .woff, .ttf or .otf file'
      : 'A logo must be a png, jpg, webp or gif picture';
  }
  return size > MAX_FILE_BYTES ? 'The file is larger than 10 MB' : '';
}

/**
 * What a font file is, by its name.
 * @param {string} fileName - e.g. `AcmeSans-BoldItalic.woff2`
 * @returns {{ family: string, weight: number, style: 'normal'|'italic', file: string }}
 */
export function faceFromFile(fileName) {
  const base = String(fileName).replace(/\.[a-z0-9]+$/i, '');
  const italic = /italic|oblique/i.test(base);
  const found = WEIGHTS.find(([word]) => word.test(base));
  // What is left once the style words are gone is the family.
  let family = base
    .replace(/italic|oblique/gi, '')
    .replace(found ? found[0] : /$^/, '')
    .replace(/variable(font)?|\[.*\]/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A bundled family cannot be redefined: the file gets a name of its own.
  if (!isCustomFamily(family)) family = `${family || 'Brand'} Custom`.trim();
  return {
    family,
    weight: found ? found[1] : 400,
    style: italic ? 'italic' : 'normal',
    file: fileName,
  };
}
