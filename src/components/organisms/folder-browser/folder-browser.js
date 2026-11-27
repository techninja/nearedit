/**
 * Folder browser organism — a dialog for choosing a folder on the server:
 * browse roots, a breadcrumb, sub-folders (those holding a project are
 * marked), "new folder", and the server's own dialog as a shortcut when
 * there is one. Opened with `pickFolder()` from `#utils/projects/folderPick.js`;
 * the router mounts the one instance.
 * @module components/organisms/folder-browser
 */

import { html, define } from 'hybrids';
import { nativeDialogOffered, openNativeDialog } from '#utils/projects/folderNative.js';
import { browseTo, cancelPick, chooseCurrent, createFolder } from '#utils/projects/folderPick.js';
import { folderPickState, setNaming } from '#utils/projects/folderPick.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { refocusIfLost } from '#utils/ui/focus.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';
import '#molecules/folder-crumbs/index.js';
import '#molecules/folder-list/index.js';
import '#molecules/folder-new/index.js';

/**
 * @typedef {Object} FolderBrowserHost
 * @property {import('#utils/projects/folderPick.js').FolderPickState} state
 */

/** @param {FolderBrowserHost} _host @param {CustomEvent} event */
function handleOpen(_host, event) {
  browseTo(event.detail.path);
}

/** @param {FolderBrowserHost} _host @param {CustomEvent} event */
function handleCreate(_host, event) {
  createFolder(event.detail.name);
}

/**
 * After a folder loads the row that was pressed no longer exists; focus
 * moves to the new list so the keyboard can carry on. The list renders its
 * rows a frame after this component, hence the wait.
 * @param {FolderBrowserHost & HTMLElement} host
 */
function keepFocus(host) {
  requestAnimationFrame(() => {
    const { request, naming } = host.state;
    if (request && !naming) refocusIfLost(host, 'folder-list button');
  });
}

/** @param {FolderBrowserHost} host @returns {any} */
function body({ state }) {
  const { listing, loading, error, nativeBusy, naming, newError } = state;
  return html`
    <div class="folder-browser-bar">
      <folder-crumbs
        path="${listing?.path || ''}"
        roots="${listing?.roots || []}"
        onfolderopen="${handleOpen}"
      ></folder-crumbs>
      ${nativeDialogOffered()
        ? html`<button
            type="button"
            class="btn btn-ghost folder-browser-native"
            disabled="${nativeBusy}"
            title="Open this computer’s own folder dialog"
            onclick="${openNativeDialog}"
          >
            ${nativeBusy ? 'Waiting for the dialog…' : 'System dialog…'}
          </button>`
        : html``}
    </div>
    ${error ? html`<p class="error-message" role="alert">${error}</p>` : html``}
    <div class="folder-browser-list" data-autofocus>
      ${listing
        ? html`<folder-list listing="${listing}" busy="${loading}" onfolderopen="${handleOpen}">
          </folder-list>`
        : html`<p class="folder-browser-wait">${loading ? 'Loading folders…' : ''}</p>`}
    </div>
    ${naming
      ? html`<folder-new
          error="${newError}"
          onfoldercreate="${handleCreate}"
          onfoldercancel="${() => setNaming(false)}"
        ></folder-new>`
      : html``}
  `;
}

/** @param {FolderBrowserHost} host @returns {any} */
function footer({ state }) {
  const { listing, request, naming } = state;
  return html`
    <button
      type="button"
      class="btn btn-ghost folder-browser-add"
      disabled="${!listing || naming}"
      onclick="${() => setNaming(true)}"
    >
      <app-icon name="folder-plus" size="sm"></app-icon> New folder
    </button>
    ${listing?.hasProject && request.projectNote
      ? html`<span class="app-dialog-note">${request.projectNote}</span>`
      : html``}
    <button type="button" class="btn btn-secondary" onclick="${cancelPick}">Cancel</button>
    <button
      type="button"
      class="btn btn-primary folder-browser-choose"
      disabled="${!listing}"
      onclick="${chooseCurrent}"
    >
      ${request.confirmLabel}
    </button>
  `;
}

/** @type {import('hybrids').Component<FolderBrowserHost>} */
export default define({
  tag: 'folder-browser',
  state: watch(folderPickState),
  render: {
    value: (host) =>
      host.state.request
        ? html`<app-dialog open onclose="${cancelPick}">
            ${dialogFrame({
              title: host.state.request.title,
              body: body(host),
              footer: footer(host),
              size: 'wide',
              onClose: cancelPick,
            })}
          </app-dialog>`
        : html``,
    shadow: false,
    observe: keepFocus,
  },
});
