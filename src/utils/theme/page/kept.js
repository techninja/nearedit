/**
 * The library theme the browser keeps. A theme that is not built in has no
 * stylesheet in the page: it is read from the server
 * (`GET /api/themes/:id`) and kept in localStorage — its id, its scheme and
 * its custom properties — so the page's boot script can paint it on the
 * next load before anything shows. Only one theme is kept: the one chosen.
 * Runs in the page (unlike the rest of `utils/theme`, it is not pure).
 * @module utils/theme/page/kept
 */

import { api } from '#utils/api/http.js';
import { THEME_TABLE } from '#utils/theme/builtin/index.js';
import { STORED, SYSTEM } from '#utils/theme/preference.js';
import { readStored, writeStored } from '#utils/ui/storage.js';

/**
 * What showing a theme needs of the server's answer.
 * @typedef {{ id: string, scheme: 'light'|'dark', variables: Record<string, string> }} ThemeAnswer
 */

/** Library themes read from the server, or kept by hand, since the page loaded. @type {Set<string>} */
const fresh = new Set();

/**
 * @param {unknown} preference
 * @returns {boolean} True when it names a theme of the library: not
 *   `system`, not the old `light` / `dark`, not a built-in theme
 */
export function isLibraryTheme(preference) {
  if (typeof preference !== 'string' || !preference) return false;
  if ([SYSTEM, 'light', 'dark'].includes(preference)) return false;
  return !Object.hasOwn(THEME_TABLE.schemes, preference);
}

/** @returns {any} The kept theme, `{}` when there is none */
export const keptTheme = () => readStored(STORED.theme);

/**
 * Keep a theme the server has just described — when the person chooses it,
 * or after it was saved — so it paints at once, now and on the next load.
 * @param {ThemeAnswer} answer - From `GET` or `PUT /api/themes/:id`
 */
export function keepTheme(answer) {
  const { id, scheme, variables } = answer;
  fresh.add(id);
  writeStored(STORED.theme, { id, scheme, variables });
}

/**
 * Forget a theme: it is read from the server again when next wanted.
 * @param {string} id
 */
export function forgetKept(id) {
  fresh.delete(id);
  if (keptTheme().id === id) writeStored(STORED.theme, {});
}

/**
 * Read a library theme from the server and keep it — once a page load: to
 * have it at all, or to learn that it changed since the browser kept it.
 * @param {string} id
 * @returns {Promise<void>|null} null when it was read already. The promise
 *   settles when the theme is kept, or could not be read (a theme that is
 *   gone is forgotten; any other failure leaves what is kept)
 */
export function refreshKept(id) {
  if (fresh.has(id)) return null;
  fresh.add(id);
  return api(`/themes/${encodeURIComponent(id)}`).then(keepTheme, (err) => {
    if (err?.status === 404) forgetKept(id);
    console.warn(`[theme] could not read the theme "${id}":`, err.message);
  });
}
