/**
 * App shell — the router and everything that exists once per app: the
 * toast, confirm and folder-browser hosts, the job centre, the theme.
 * An address outside the app shows the not-found page instead of the
 * routed views, so the address stays in the bar to be corrected.
 * @module router
 */

import { html, define, router, store } from 'hybrids';
import AppState from '#store/AppState.js';
import HomeView from '#pages/home/index.js';
import { startJobCenter } from '#utils/ui/jobCenter.js';
import { isKnownPath } from '#utils/ui/routes.js';
import { applyTheme, onSystemThemeChange } from '#utils/ui/theme.js';
import '#molecules/app-confirm-host/index.js';
import '#molecules/app-toast-host/index.js';
import '#organisms/folder-browser/index.js';
import '#pages/not-found/index.js';

/**
 * @typedef {Object} AppRouterHost
 * @property {boolean} missing - The address is not a page of the app
 * @property {import('#store/AppState.js').AppStateShape} appState
 * @property {boolean} shell - Internal: runs the app-wide services while connected
 */

// "/project/abc/" is the same page as "/project/abc".
const { pathname, search, hash } = globalThis.location;
if (pathname.length > 1 && pathname.endsWith('/')) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  globalThis.history.replaceState(globalThis.history.state, '', trimmed + search + hash);
}

define({
  tag: 'app-routes',
  // No `url` option: the router then keeps the address the app was opened
  // at, so a deep link stays in the address bar.
  stack: router(HomeView),
  render: {
    value: ({ stack }) => html`${stack}`,
    shadow: false,
  },
});

/**
 * Follow the stored theme, and the OS while the preference is "system".
 * @param {AppRouterHost} host
 * @returns {() => void} disconnect
 */
function connectShell(host) {
  const stopJobs = startJobCenter();
  const stopTheme = onSystemThemeChange(() => {
    if (store.ready(host.appState)) applyTheme(host.appState.theme);
  });
  return () => {
    stopJobs();
    stopTheme();
  };
}

/** @type {import('hybrids').Component<AppRouterHost>} */
export default define({
  tag: 'app-router',
  missing: { value: () => !isKnownPath(globalThis.location.pathname) },
  appState: {
    ...store(AppState),
    observe: (_host, state) => {
      if (store.ready(state)) applyTheme(state.theme);
    },
  },
  shell: { value: true, connect: connectShell },
  render: {
    value: ({ missing }) => html`
      ${missing
        ? html`<not-found-view path="${globalThis.location.pathname}"></not-found-view>`
        : html`<app-routes></app-routes>`}
      <folder-browser></folder-browser>
      <app-confirm-host></app-confirm-host>
      <app-toast-host></app-toast-host>
    `,
    shadow: false,
  },
});
