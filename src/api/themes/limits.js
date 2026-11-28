/**
 * The bounds of the theme library, as data: how large a theme file may be,
 * how many themes the library holds.
 * Contract: docs/app-spec/THEMES.md § The library.
 * @module api/themes/limits
 */

/** Largest theme file that is read or written, and largest text taken for import, bytes. */
export const MAX_THEME_BYTES = 64 * 1024;

/** Themes the library may hold. */
export const MAX_THEMES = 500;

/** The colours a list shows each theme by: role ids. */
export const SWATCHES = ['bg', 'surface', 'text', 'accent', 'clipVideo', 'clipAudio', 'clipImage'];
