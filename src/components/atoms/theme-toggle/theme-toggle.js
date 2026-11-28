/**
 * Theme toggle atom — flips between the light and the dark theme the system
 * would give (Daylight and Studio). The choice is kept in AppState; picking
 * what the system gives anyway goes back to following the system (see
 * `#utils/ui/theme.js`). Choosing among all themes is the picker's job.
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
      const preference = store.ready(state) ? state.theme : 'system';
      const dark = resolveTheme(preference).scheme === 'dark';
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
