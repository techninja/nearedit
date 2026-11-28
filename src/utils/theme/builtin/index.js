/**
 * The themes the editor brings: Studio and Daylight (what it opens in),
 * Midnight and Paper (its first two looks, kept), High contrast. They reach
 * the page as generated stylesheets (`scripts/build-themes.js`).
 * Contract: docs/app-spec/THEMES.md § Built-in themes.
 * @module utils/theme/builtin
 */

import contrast from './contrast.js';
import daylight from './daylight.js';
import midnight from './midnight.js';
import paper from './paper.js';
import studio from './studio.js';

/** @typedef {import('#utils/theme/model.js').Theme} Theme */

/** In the order a list shows them. @type {ReadonlyArray<Theme>} */
export const BUILTIN_THEMES = Object.freeze([studio, daylight, midnight, paper, contrast]);

/**
 * The theme shown while no theme is chosen: by the system's scheme, and
 * `contrast` when the system asks for more contrast.
 */
export const SYSTEM_THEMES = Object.freeze({
  light: daylight.id,
  dark: studio.id,
  contrast: contrast.id,
});

/**
 * What the page needs to know before it paints: each built-in theme's
 * scheme, and which of them follow the system.
 * @type {import('#utils/theme/preference.js').ThemeTable}
 */
export const THEME_TABLE = Object.freeze({
  schemes: Object.freeze(
    Object.fromEntries(BUILTIN_THEMES.map((theme) => [theme.id, theme.scheme || 'dark'])),
  ),
  system: SYSTEM_THEMES,
});

/**
 * @param {unknown} id
 * @returns {Theme|null}
 */
export const builtinTheme = (id) => BUILTIN_THEMES.find((theme) => theme.id === id) || null;

/**
 * @param {unknown} id
 * @returns {boolean} True for the id of a built-in theme
 */
export const isBuiltinTheme = (id) => builtinTheme(id) !== null;
