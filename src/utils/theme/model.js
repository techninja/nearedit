/**
 * A theme as data: an id, a name, a scheme, the theme it extends and the
 * roles it sets — nothing else. `normalizeTheme` reads one out of anything
 * and keeps what a theme can hold. Isomorphic and pure.
 * Contract: docs/app-spec/THEMES.md § A theme.
 * @module utils/theme/model
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { cleanColor } from './color.js';
import { roleOf } from './roles.js';

/** @typedef {import('./roles.js').Scheme} Scheme */

/**
 * A theme as a file holds it.
 * @typedef {Object} Theme
 * @property {string} id - Letters, digits, `-` and `_`, lower case
 * @property {string} name
 * @property {string} description - One line for a list of themes
 * @property {Scheme|''} scheme - '' : the scheme of the theme it extends
 * @property {string} extends - Another theme's id, or ''
 * @property {Record<string, string>} roles - Role id → `#rrggbb`: only what
 *   this theme sets
 */

/**
 * A problem found in a theme (the shape brand kits use).
 * @typedef {{ path: string, message: string, level: 'error'|'warning' }} Problem
 */

/** The two schemes a theme can have. @type {ReadonlyArray<Scheme>} */
export const SCHEMES = Object.freeze(['light', 'dark']);

/** The bounds of a theme. Lengths are characters. */
export const THEME_LIMITS = Object.freeze({
  /** A theme's id. */
  id: 40,
  /** Its name. */
  name: 80,
  /** Its description. */
  description: 200,
  /** Themes in a chain of `extends`, the first included. */
  depth: 5,
});

/** What an id looks like: it is a file name, an attribute value and a CSS selector. */
export const THEME_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Ids no theme can have: they are preferences (`system`, and the old `light` and `dark`). */
export const RESERVED_IDS = Object.freeze(['system', 'light', 'dark']);

/**
 * @param {unknown} value
 * @returns {boolean} True for a string that can name a theme
 */
export const isThemeId = (value) =>
  typeof value === 'string' && THEME_ID.test(value) && !RESERVED_IDS.includes(value);

/**
 * @param {unknown} value
 * @returns {boolean} True for `light` and `dark`
 */
export const isScheme = (value) => SCHEMES.includes(/** @type {any} */ (value));

/**
 * An id made from a name: "Catppuccin Mocha" → `catppuccin-mocha`.
 * @param {unknown} name
 * @returns {string} '' when nothing usable is left
 */
export function themeIdFrom(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, THEME_LIMITS.id)
    .replace(/-+$/, '');
  return isThemeId(slug) ? slug : '';
}

/**
 * Read a theme out of anything: what a theme can hold is kept, the rest is
 * dropped in silence (`validateTheme` says what was wrong).
 * @param {unknown} raw
 * @param {string} [id] - The id it is known by; default: the one it gives itself
 * @returns {Theme}
 */
export function normalizeTheme(raw, id) {
  const given = isPlainObject(raw) ? /** @type {Record<string, any>} */ (raw) : {};
  /** @type {Record<string, string>} */
  const roles = {};
  for (const [name, value] of Object.entries(isPlainObject(given.roles) ? given.roles : {})) {
    const color = cleanColor(value);
    if (roleOf(name) && color) roles[name] = color;
  }
  const own = isThemeId(given.id) ? given.id : '';
  /** @type {(value: unknown, max: number) => string} */
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  return {
    id: id ?? own,
    name: text(given.name, THEME_LIMITS.name),
    description: text(given.description, THEME_LIMITS.description),
    scheme: isScheme(given.scheme) ? given.scheme : '',
    extends: isThemeId(given.extends) ? given.extends : '',
    roles,
  };
}
