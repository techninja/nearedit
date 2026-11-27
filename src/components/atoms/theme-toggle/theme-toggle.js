/**
 * Theme toggle atom — flips between the light and dark look. The choice is
 * kept in AppState; picking the look the OS would give anyway goes back to
 * following the OS (see `#utils/ui/theme.js`).
 * @module components/atoms/theme-toggle
 */

import { html, define, store } from 'hybrids';
import AppState from '#store/AppState.js';
import { applyTheme, resolveTheme, toggledPreference } from '#utils/ui/theme.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ThemeToggleHost
 * @property {import('#store/AppState.js').AppStateShape} state
 */

/** @param {ThemeToggleHost & HTMLElement} host */
function handleToggle(host) {
  if (!store.ready(host.state)) return;
  const theme = toggledPreference(host.state.theme);
  applyTheme(theme);
  store.set(host.state, { theme });
}

const SUN = html`<app-icon name="sun" size="sm"></app-icon>`;
const MOON = html`<app-icon name="moon" size="sm"></app-icon>`;

/** @type {import('hybrids').Component<ThemeToggleHost>} */
export default define({
  tag: 'theme-toggle',
  state: store(AppState),
  render: {
    value: ({ state }) => {
      const dark = resolveTheme(store.ready(state) ? state.theme : 'system') === 'dark';
      const label = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
      return html`
        <button
          type="button"
          class="icon-btn"
          aria-label="${label}"
          title="${label}"
          onclick="${handleToggle}"
        >
          ${dark ? SUN : MOON}
        </button>
      `;
    },
    shadow: false,
  },
});
