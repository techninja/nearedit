/**
 * Home page — the list of projects and the way to add one.
 * @module pages/home
 */

import { html, define, router } from 'hybrids';
import ProjectView from '#pages/project/index.js';
import { HOME_URL } from '#utils/ui/routes.js';
import { setPageTitle } from '#utils/ui/title.js';
import '#atoms/app-icon/index.js';
import '#atoms/theme-toggle/index.js';
import '#organisms/job-tray/index.js';
import '#organisms/project-create/index.js';
import '#organisms/project-list/index.js';

/** @type {import('hybrids').Component<{}>} */
export default define({
  tag: 'home-view',
  [router.connect]: { url: '/', stack: [ProjectView] },
  render: {
    value: () => html`
      <header class="app-bar">
        <a class="app-bar-brand" href="${HOME_URL}">
          <app-icon name="clapperboard" size="md"></app-icon> NearEdit
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
