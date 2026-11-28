/**
 * The brand a director action works in. A job is handed the project's
 * effective kit (`projectKit`, docs/app-spec/BRAND-API.md) as `ctx.kit`;
 * whoever runs an action without one — a test, a caller outside a project —
 * gets the kit every chain rests on. Text set in a kit's own fonts is
 * measured with those fonts, so they are registered on the server canvas
 * here before anything is laid out.
 * @module api/director/brand/kit
 */

import { DEFAULT_KIT, builtinKit, resolveKit } from '#utils/brand/index.js';
import { registerDocumentFonts } from '../../compose/index.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** @type {Kit|null} */
let fallback = null;

/**
 * The kit of an action.
 * @param {{ kit?: Kit|null }} ctx - An ActionContext
 * @returns {Kit} An effective kit; never changed by the director
 */
export function kitOf(ctx) {
  if (ctx?.kit) return ctx.kit;
  fallback ??= resolveKit(builtinKit(DEFAULT_KIT));
  return fallback;
}

/**
 * Make a kit's own font files measurable on the server canvas. The files
 * are the kit's: they were located inside its folder when it was resolved.
 * @param {Kit} kit
 * @returns {string[]} Files that could not be loaded; their text is
 *   measured — and drawn — in the fallback family
 */
export function measureWith(kit) {
  return Array.isArray(kit?.fonts) && kit.fonts.length ? registerDocumentFonts(kit.fonts) : [];
}

/**
 * How a result names the kit it followed.
 * @param {Kit} kit
 * @returns {string}
 */
export const kitName = (kit) => kit.name || kit.id || 'the brand kit';
