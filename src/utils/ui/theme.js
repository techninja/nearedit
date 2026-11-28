/**
 * The theme in the running app. The stored preference is `system` — follow
 * the system: Daylight when it is light, Studio when it is dark, High
 * contrast when it asks for more contrast — until the person chooses a
 * theme (docs/app-spec/THEMES.md § How the page chooses). The page's boot
 * script applies the same rule before first paint, so there is no flash.
 *
 * A built-in theme is a stylesheet already in the page. Any other theme is
 * read from the library and set on the page as custom properties
 * (`#utils/theme/page/kept.js`).
 * @module utils/ui/theme
 */

import { SYSTEM_THEMES, THEME_TABLE } from '#utils/theme/builtin/index.js';
import { forgetKept, isLibraryTheme, keptTheme, refreshKept } from '#utils/theme/page/kept.js';
import { SYSTEM, paintTheme, pickTheme } from '#utils/theme/preference.js';

/** @typedef {import('#utils/theme/preference.js').ShownTheme} ShownTheme */
/** @typedef {import('#utils/theme/preference.js').SystemLook} SystemLook */
/** @typedef {import('#utils/theme/page/kept.js').ThemeAnswer} ThemeAnswer */

const QUERIES = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'];

/** What the app was last asked to show, and a theme shown over it for a moment. */
const state = { preference: SYSTEM, preview: /** @type {ShownTheme|null} */ (null), painted: '' };
/** @type {Set<(shown: ShownTheme) => void>} */
const listeners = new Set();

/** @returns {SystemLook} What the system asks for now */
export function systemLook() {
  const [dark, contrast] = QUERIES.map((query) => Boolean(globalThis.matchMedia?.(query).matches));
  return { dark, contrast };
}

/**
 * The theme a preference results in.
 * @param {string} preference - `system`, a theme's id, or the old `light` / `dark`
 * @param {SystemLook} [system]
 * @param {any} [kept] - The library theme the browser keeps
 * @returns {ShownTheme} A library theme the browser does not keep cannot
 *   be shown before it is read: the system's theme stands in
 */
export function resolveTheme(preference, system = systemLook(), kept = keptTheme()) {
  return pickTheme(preference, system, THEME_TABLE, kept);
}

/**
 * The preference to store when the person flips between light and dark:
 * the system's theme of the other scheme. Choosing what the system would
 * give anyway goes back to `system`, so the app follows the system again
 * instead of being pinned to today's setting.
 * @param {string} preference - Current preference
 * @param {SystemLook} [system]
 * @returns {string}
 */
export function toggledPreference(preference, system = systemLook()) {
  const next = resolveTheme(preference, system).scheme === 'dark' ? 'light' : 'dark';
  return resolveTheme(SYSTEM, system).scheme === next ? SYSTEM : SYSTEM_THEMES[next];
}

/**
 * @param {ShownTheme} shown
 * @returns {ShownTheme} The theme now showing
 */
function paint(shown) {
  const signature = JSON.stringify(shown);
  if (signature === state.painted) return shown;
  state.painted = signature;
  const root = globalThis.document?.documentElement;
  if (root) paintTheme(root, shown);
  for (const listener of [...listeners]) listener(shown);
  return shown;
}

/**
 * Put a preference on the page. Cheap to call again with the same one. A
 * library theme is read from the server once a page load — to show it at
 * all, or to learn that it changed — and painted when it arrives.
 * @param {string} preference
 * @returns {string} The id of the theme now showing
 */
export function applyTheme(preference) {
  state.preference = preference;
  if (state.preview) return paint(state.preview).id;
  if (isLibraryTheme(preference) && globalThis.document) {
    refreshKept(preference)?.then(() => {
      if (state.preference === preference) applyTheme(preference);
    });
  }
  return paint(resolveTheme(preference)).id;
}

/**
 * Show a theme for a moment without choosing it — what a picker does while
 * the pointer is on an entry — or stop doing so.
 * @param {ThemeAnswer|null} theme - null: back to the preference
 */
export function previewTheme(theme) {
  const builtin = theme && Object.hasOwn(THEME_TABLE.schemes, theme.id);
  const variables = theme && !builtin ? theme.variables : null;
  state.preview = theme && { id: theme.id, scheme: theme.scheme, variables };
  applyTheme(state.preference);
}

/**
 * Forget what the browser keeps of a library theme, after it was deleted
 * or changed elsewhere: it is read again when next shown. (A theme the
 * server has just described is kept with `keepTheme` instead.)
 * @param {string} id
 */
export function forgetTheme(id) {
  forgetKept(id);
  if (state.preference === id) applyTheme(id);
}

/**
 * Call back whenever the theme on the page changes.
 * @param {(shown: ShownTheme) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Call back when the system switches between light and dark, or changes
 * how much contrast it asks for.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onSystemThemeChange(listener) {
  const queries = QUERIES.map((query) => globalThis.matchMedia?.(query));
  for (const query of queries) query?.addEventListener('change', listener);
  return () => queries.forEach((query) => query?.removeEventListener('change', listener));
}
