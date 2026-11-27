/**
 * Folder list molecule — the sub-folders of one folder, as rows to step
 * into. Announces the wanted folder with `folderopen` (`detail.path`).
 * Arrow keys move between rows, Backspace goes up.
 * @module components/molecules/folder-list
 */

import { html, define, dispatch } from 'hybrids';
import { arrowFocus } from '#utils/ui/focus.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} FolderListHost
 * @property {import('#utils/projects/api.js').FolderListing} listing
 * @property {boolean} busy - A folder is being loaded
 */

/**
 * @param {FolderListHost & HTMLElement} host
 * @param {string} path
 */
function open(host, path) {
  if (path) dispatch(host, 'folderopen', { detail: { path }, bubbles: true });
}

/**
 * @param {FolderListHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  open(host, /** @type {HTMLElement} */ (event.currentTarget).dataset.path);
}

/**
 * @param {FolderListHost & HTMLElement} host
 * @param {KeyboardEvent} event
 */
function handleKeydown(host, event) {
  if (event.key === 'Backspace' && host.listing.parent) {
    event.preventDefault();
    open(host, host.listing.parent);
    return;
  }
  arrowFocus(/** @type {HTMLElement[]} */ ([...host.querySelectorAll('button')]), event);
}

/**
 * @param {import('#utils/projects/api.js').FolderEntry} dir
 * @returns {import('hybrids').UpdateFunctionWithMethods<FolderListHost>}
 */
function row(dir) {
  return html`
    <li>
      <button
        type="button"
        class="folder-list-row"
        data-path="${dir.path}"
        onclick="${handleClick}"
      >
        <app-icon name="folder" size="sm"></app-icon>
        <span class="folder-list-name">${dir.name}</span>
        ${dir.hasProject
          ? html`<span class="chip folder-list-project" title="This folder holds a NearEdit project"
              ><app-icon name="clapperboard" size="sm"></app-icon> Project</span
            >`
          : html``}
        <app-icon class="folder-list-enter" name="chevron" size="sm"></app-icon>
      </button>
    </li>
  `.key(dir.path);
}

/** @type {import('hybrids').Component<FolderListHost>} */
export default define({
  tag: 'folder-list',
  listing: { value: { path: '', parent: null, roots: [], hasProject: false, dirs: [] } },
  busy: { value: false, reflect: true },
  render: {
    value: ({ listing }) => html`
      <ul class="folder-list" aria-label="Folders" onkeydown="${handleKeydown}">
        ${listing.parent
          ? html`<li>
              <button
                type="button"
                class="folder-list-row folder-list-up"
                data-path="${listing.parent}"
                onclick="${handleClick}"
              >
                <app-icon name="chevron-up" size="sm"></app-icon>
                <span class="folder-list-name">Up one level</span>
              </button>
            </li>`
          : html``}
        ${listing.dirs.map(row)}
      </ul>
      ${listing.path && !listing.dirs.length
        ? html`<p class="folder-list-empty">No folders in here.</p>`
        : html``}
    `,
    shadow: false,
  },
});
