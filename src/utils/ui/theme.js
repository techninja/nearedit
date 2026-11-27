/**
 * Theme handling: the stored preference is `system` (follow the OS) until
 * the user picks the other look. `index.html` applies the same rule inline
 * before first paint, so there is no flash.
 * @module utils/ui/theme
 */

/** @typedef {'system'|'light'|'dark'} ThemePreference */
/** @typedef {'light'|'dark'} Theme */

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** @returns {boolean} Whether the OS asks for a dark interface */
export function systemPrefersDark() {
  return Boolean(globalThis.matchMedia?.(DARK_QUERY).matches);
}

/**
 * The look a preference results in.
 * @param {string} preference
 * @param {boolean} [systemDark]
 * @returns {Theme}
 */
export function resolveTheme(preference, systemDark = systemPrefersDark()) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemDark ? 'dark' : 'light';
}

/**
 * The preference to store when the user flips the theme. Choosing the look
 * the OS would give anyway goes back to `system`, so the app follows the OS
 * again instead of being pinned to today's setting.
 * @param {string} preference - Current preference
 * @param {boolean} [systemDark]
 * @returns {ThemePreference}
 */
export function toggledPreference(preference, systemDark = systemPrefersDark()) {
  const next = resolveTheme(preference, systemDark) === 'dark' ? 'light' : 'dark';
  return next === resolveTheme('system', systemDark) ? 'system' : next;
}

/**
 * Put a preference on the page.
 * @param {string} preference
 * @returns {Theme} The theme now showing
 */
export function applyTheme(preference) {
  const theme = resolveTheme(preference);
  const root = globalThis.document?.documentElement;
  if (root && root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
  return theme;
}

/**
 * Call back when the OS switches between light and dark.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onSystemThemeChange(listener) {
  const query = globalThis.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
