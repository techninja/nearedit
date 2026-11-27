/**
 * New-folder molecule — a one-line form for naming a folder. Announces
 * `foldercreate` (`detail.name`) on submit and `foldercancel` on cancel;
 * the owner creates the folder and passes back an `error` if it failed.
 * @module components/molecules/folder-new
 */

import { html, define, dispatch } from 'hybrids';
import { folderNameProblem } from '#utils/projects/folderPath.js';

/**
 * @typedef {Object} FolderNewHost
 * @property {string} name
 * @property {string} error - Why the folder could not be created (from the owner)
 * @property {string} problem - What is wrong with the typed name
 */

/**
 * @param {FolderNewHost & HTMLElement} host
 * @param {Event} event
 */
function handleSubmit(host, event) {
  event.preventDefault();
  host.problem = folderNameProblem(host.name);
  if (!host.problem) dispatch(host, 'foldercreate', { detail: { name: host.name.trim() } });
}

/** @param {FolderNewHost & HTMLElement} host */
function handleCancel(host) {
  dispatch(host, 'foldercancel');
}

/** @type {import('hybrids').Component<FolderNewHost>} */
export default define({
  tag: 'folder-new',
  name: '',
  error: '',
  problem: '',
  render: {
    value: ({ name, error, problem }) => html`
      <form class="folder-new" onsubmit="${handleSubmit}">
        <input
          class="field-input"
          data-autofocus
          aria-label="Name of the new folder"
          placeholder="New folder name"
          maxlength="255"
          value="${name}"
          oninput="${html.set('name')}"
        />
        <button type="submit" class="btn btn-secondary">Create</button>
        <button type="button" class="btn btn-ghost" onclick="${handleCancel}">Cancel</button>
      </form>
      ${problem || error
        ? html`<p class="error-message" role="alert">${problem || error}</p>`
        : html``}
    `,
    shadow: false,
  },
});
