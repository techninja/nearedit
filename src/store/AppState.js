/**
 * Global UI state — singleton, persisted to localStorage.
 * Theme (with system preference detection), panel sizes.
 * @module store/AppState
 */

import { store } from 'hybrids';

/** @type {import('hybrids').Model<object>} */
const AppState = {
  theme: 'dark',
  panelHeight: 0, // 0 = auto (50/50 split), >0 = px height of top panels
  [store.connect]: {
    get: () => {
      const raw = localStorage.getItem('nearedit_appState');
      if (raw) return JSON.parse(raw);
      // Detect system preference
      const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
      return { theme: prefersDark ? 'dark' : 'light' };
    },
    set: (id, values) => {
      localStorage.setItem('nearedit_appState', JSON.stringify(values));
      return values;
    },
  },
};

export default AppState;
