/**
 * A motion piece in the project's brand: when the request asks for the
 * `brand` theme — the default — the piece is completed and built with the
 * theme made from the kit's tokens, its opening, section cards and closing
 * are the kit's own elements, and the result names the font files its
 * titles need.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Motion piece.
 * @module api/director/motion/dress
 */

import { BRAND, brandTheme, themeFonts } from '#utils/director/brand/theme.js';
import { kitName, kitOf, measureWith } from '../brand/kit.js';
import { CARD_KINDS } from './kinds.js';

/**
 * @typedef {Object} Dress
 * @property {import('#utils/brand/types.js').Kit} kit
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {string} name - What the kit is called
 * @property {import('#utils/brand/fontTable.js').FontFace[]} fonts - Font
 *   files of the kit the piece's titles are set in
 */

/**
 * The brand a piece is built in.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {Dress|null} null when the request names another theme
 */
export function motionDress(ctx) {
  if (ctx.directive.params.theme !== BRAND) return null;
  const kit = kitOf(ctx);
  measureWith(kit);
  const theme = brandTheme(kit);
  return { kit, theme, name: kitName(kit), fonts: themeFonts(kit, theme) };
}

/**
 * What the result says about the brand.
 * @param {Dress} dress
 * @param {{ kind?: string }[]} scenes - The complete plan's
 * @returns {string[]}
 */
export function dressNotes(dress, scenes) {
  const notes = [
    `On brand: the colours, fonts and motion of the kit “${dress.name}”. Choose another ` +
      'theme in the form to leave the brand.',
  ];
  const cards = scenes
    .map((scene, i) => (CARD_KINDS.includes(scene.kind) ? `scene ${i + 1} its ${scene.kind}` : ''))
    .filter(Boolean);
  if (cards.length) {
    notes.push(
      `Drawn by the kit’s own elements: ${cards.join(', ')}. They are element clips — ` +
        '“Update to brand” brings them up to date when the kit changes.',
    );
  }
  if (dress.fonts.length) {
    const families = [...new Set(dress.fonts.map((face) => face.family))].join(', ');
    notes.push(`The titles are set in the kit’s own font (${families}).`);
  }
  return notes;
}
