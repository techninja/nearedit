/**
 * Which theme the page shows, and putting it on the page. The preference is
 * `system` — follow the system: one theme when it is light, one when it is
 * dark, one when it asks for more contrast — or a theme's id. `light` and
 * `dark`, which older versions stored, mean the system's two themes.
 *
 * `pickTheme` and `paintTheme` use nothing outside themselves:
 * `scripts/build-themes.js` writes their source into the script the page
 * runs before it first paints (`boot.js`), so the page and the app decide
 * by the same code. Keep their lines under 98 characters.
 * Contract: docs/app-spec/THEMES.md § How the page chooses.
 * @module utils/theme/preference
 */

/** @typedef {import('./roles.js').Scheme} Scheme */

/**
 * What the system asks for.
 * @typedef {{ dark: boolean, contrast: boolean }} SystemLook
 */

/**
 * The themes the page knows without asking: the built-in ones.
 * @typedef {Object} ThemeTable
 * @property {Record<string, Scheme>} schemes - Built-in theme id → scheme
 * @property {{ light: string, dark: string, contrast: string }} system - The
 *   theme shown while the preference is `system`
 */

/**
 * A theme as the page shows it.
 * @typedef {Object} ShownTheme
 * @property {string} id
 * @property {Scheme} scheme
 * @property {Record<string, string>|null} variables - Custom properties
 *   set on the page itself; null for a built-in theme, whose stylesheet
 *   is in the page
 */

/** The preference that follows the system. */
export const SYSTEM = 'system';

/** Where the browser keeps the preference (the app state) and the last library theme shown. */
export const STORED = Object.freeze({ state: 'nearedit_appState', theme: 'nearedit_theme' });

/**
 * The theme a preference results in.
 * @param {unknown} preference - `system`, a theme's id, or the old `light` / `dark`
 * @param {SystemLook} system
 * @param {ThemeTable} table
 * @param {any} [cached] - The library theme last shown (`{ id, scheme, variables }`),
 *   as the browser kept it
 * @returns {ShownTheme} A library theme that is not the cached one cannot
 *   be shown yet: the system's theme stands in
 */
export function pickTheme(preference, system, table, cached) {
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const old = preference === 'light' || preference === 'dark' ? table.system[preference] : '';
  const wanted = old || preference;
  if (typeof wanted === 'string' && has(table.schemes, wanted)) {
    return { id: wanted, scheme: table.schemes[wanted], variables: null };
  }
  const kept = cached && typeof cached === 'object' && cached.id === wanted ? cached : null;
  const usable = kept && typeof kept.variables === 'object' && kept.variables !== null;
  if (usable && (kept.scheme === 'light' || kept.scheme === 'dark')) {
    return { id: kept.id, scheme: kept.scheme, variables: kept.variables };
  }
  const look = system.contrast ? 'contrast' : system.dark ? 'dark' : 'light';
  const id = table.system[look];
  return { id, scheme: table.schemes[id], variables: null };
}

/**
 * Put a theme on the page: its id and scheme on the root element, and — for
 * a theme whose stylesheet is not in the page — its custom properties on
 * the root element's own style. What an earlier theme set there is removed.
 * @param {HTMLElement} root - The document's root element
 * @param {ShownTheme} shown
 */
export function paintTheme(root, shown) {
  const style = root.style;
  for (let i = style.length - 1; i >= 0; i -= 1) {
    if (/^--(color|shadow)-/.test(style.item(i))) style.removeProperty(style.item(i));
  }
  const variables = shown.variables || {};
  for (const name of Object.keys(variables)) {
    const value = variables[name];
    const safe = typeof value === 'string' && /^[#a-z0-9 .,%()/-]{1,80}$/i.test(value);
    if (safe && /^--(color|shadow)-[a-z0-9-]+$/.test(name)) style.setProperty(name, value);
  }
  if (root.getAttribute('data-theme') !== shown.id) root.setAttribute('data-theme', shown.id);
  if (root.getAttribute('data-scheme') !== shown.scheme) {
    root.setAttribute('data-scheme', shown.scheme);
  }
}
