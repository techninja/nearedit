/**
 * Home page — the list of projects and the way to add one. Its header
 * carries the logo, which builds itself the first time the page shows in
 * a visit and stands still after that.
 * @module pages/home
 */

import { html, define, router } from 'hybrids';
import ProjectView from '#pages/project/index.js';
import { HOME_URL } from '#utils/ui/routes.js';
import { setPageTitle } from '#utils/ui/title.js';
import '#atoms/app-logo/index.js';
import '#atoms/theme-toggle/index.js';
import '#organisms/job-tray/index.js';
import '#organisms/project-create/index.js';
import '#organisms/project-list/index.js';

/**
 * @typedef {Object} HomeViewHost
 * @property {boolean} greet - The logo builds itself: first showing of this visit
 */

/** Session key: the logo has built itself in this browser tab. */
export const GREETED_KEY = 'nearedit_logoGreeted';

let greeted = false;

/**
 * Whether the home page shows for the first time in this visit — a browser
 * tab's session, so a reload does not play the logo again.
 * @returns {boolean}
 */
function firstShowing() {
  if (greeted) return false;
  greeted = true;
  try {
    const seen = sessionStorage.getItem(GREETED_KEY);
    sessionStorage.setItem(GREETED_KEY, '1');
    return !seen;
  } catch {
    // Storage is blocked (a private window, an embedded frame): once per page load.
    return true;
  }
}

/** @type {import('hybrids').Component<HomeViewHost>} */
export default define({
  tag: 'home-view',
  [router.connect]: { url: '/', stack: [ProjectView] },
  greet: {
    value: false,
    connect: (host) => {
      host.greet = firstShowing();
    },
  },
  render: {
    value: ({ greet }) => html`
      <header class="app-bar">
        <a class="app-bar-brand" href="${HOME_URL}">
          <app-logo variant="wordmark" animated="${greet}"></app-logo>
        </a>
        <span class="app-bar-spacer"></span>
        <job-tray></job-tray>
        <theme-toggle></theme-toggle>
      </header>
      <main class="app-page">
        <project-list></project-list>
      </main>
      <project-create></project-create>
    `,
    shadow: false,
    connect: () => {
      setPageTitle('Projects');
    },
  },
});
