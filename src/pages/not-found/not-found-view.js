/**
 * Not-found page — shown for an address that is not part of the app.
 * @module pages/not-found
 */

import { html, define } from 'hybrids';
import { HOME_URL } from '#utils/ui/routes.js';
import { setPageTitle } from '#utils/ui/title.js';
import '#atoms/app-icon/index.js';
import '#atoms/app-logo/index.js';
import '#atoms/theme-toggle/index.js';

/**
 * @typedef {Object} NotFoundViewHost
 * @property {string} path - The address that led nowhere
 */

/** @type {import('hybrids').Component<NotFoundViewHost>} */
export default define({
  tag: 'not-found-view',
  path: '',
  render: {
    value: ({ path }) => html`
      <header class="app-bar">
        <a class="app-bar-brand" href="${HOME_URL}">
          <app-logo variant="wordmark"></app-logo>
        </a>
        <span class="app-bar-spacer"></span>
        <theme-toggle></theme-toggle>
      </header>
      <main class="app-full-state">
        <app-icon name="search" size="lg"></app-icon>
        <h1>Page not found</h1>
        <p>
          <code class="not-found-view-path">${path}</code> does not lead anywhere in NearEdit. The
          address may be mistyped, or it points to a project that was removed from the list.
        </p>
        <a class="btn btn-primary" href="${HOME_URL}">Go to your projects</a>
      </main>
    `,
    shadow: false,
    connect: () => {
      setPageTitle('Page not found');
    },
  },
});
