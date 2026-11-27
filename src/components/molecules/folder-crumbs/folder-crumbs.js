/**
 * Folder breadcrumb molecule — where the folder browser is: the browse
 * roots (when there are several) and the trail from the root down to the
 * open folder. Announces a wanted folder with `folderopen` (`detail.path`).
 * @module components/molecules/folder-crumbs
 */

import { html, define, dispatch } from 'hybrids';
import { breadcrumb, rootOf } from '#utils/projects/folderPath.js';
import { baseName } from '#utils/ui/format.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} FolderCrumbsHost
 * @property {string} path - The open folder
 * @property {string[]} roots - Browse roots
 */

/**
 * @param {FolderCrumbsHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  const { path } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'folderopen', { detail: { path }, bubbles: true });
}

/** @type {import('hybrids').Component<FolderCrumbsHost>} */
export default define({
  tag: 'folder-crumbs',
  path: '',
  roots: { value: [] },
  render: {
    value: ({ path, roots }) => {
      const crumbs = breadcrumb(path, roots);
      const current = rootOf(path, roots);
      return html`
        ${roots.length > 1
          ? html`<div class="folder-crumbs-roots" role="group" aria-label="Locations">
              ${roots.map(
                (root) =>
                  html`<button
                    type="button"
                    class="chip"
                    data-path="${root}"
                    title="${root}"
                    aria-pressed="${root === current ? 'true' : 'false'}"
                    onclick="${handleClick}"
                  >
                    ${baseName(root) || root}
                  </button>`,
              )}
            </div>`
          : html``}
        <nav class="folder-crumbs-trail" aria-label="Folder path">
          ${crumbs.map(
            (crumb, index) => html`
              ${index ? html`<app-icon name="chevron" size="sm"></app-icon>` : html``}
              <button
                type="button"
                class="folder-crumbs-crumb"
                data-path="${crumb.path}"
                aria-current="${index === crumbs.length - 1 ? 'location' : 'false'}"
                onclick="${handleClick}"
              >
                ${crumb.name}
              </button>
            `,
          )}
        </nav>
      `;
    },
    shadow: false,
  },
});
