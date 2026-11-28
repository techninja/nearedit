/**
 * Global UI state — singleton, persisted to localStorage: the theme
 * preference and the editor's panel layout.
 * @module store/AppState
 */

import { store } from 'hybrids';
import { readStored, writeStored } from '#utils/ui/storage.js';

/** localStorage key; the page's boot script reads `theme` from it before first paint. */
export const APP_STATE_KEY = 'nearedit_appState';

/**
 * @typedef {Object} AppStateShape
 * @property {string} theme - `system` follows the OS; otherwise a theme's id
 *   (`#utils/ui/theme.js`). The `light` and `dark` of older versions still work
 * @property {number} dockWidth - Side dock width in px; 0 = default
 * @property {number} timelineHeight - Timeline height in px; 0 = default
 * @property {number} sheetHeight - Narrow layout: bottom sheet height in px; 0 = default
 * @property {boolean} sheetOpen - Narrow layout: whether the bottom sheet is open
 * @property {string} dockTab - Active dock tab: media | inspector | transcript | director
 */

/** @type {import('hybrids').Model<AppStateShape>} */
const AppState = {
  theme: 'system',
  dockWidth: 0,
  timelineHeight: 0,
  sheetHeight: 0,
  sheetOpen: false,
  dockTab: 'media',
  [store.connect]: {
    get: () => readStored(APP_STATE_KEY),
    set: (_id, values) => {
      writeStored(APP_STATE_KEY, values);
      return values;
    },
  },
};

export default AppState;

/**
 * Patch the app state from plain code (components may also `store.set`).
 * @param {Partial<AppStateShape>} patch
 */
export function setAppState(patch) {
  store
    .set(AppState, patch)
    .catch((err) => console.error('[app] could not update the app state:', err));
}
