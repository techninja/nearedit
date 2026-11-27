/**
 * New-project dialog organism — a folder (chosen with the folder browser)
 * and a name. A folder that already holds a project is opened, not
 * re-created, and the dialog says so. State lives in `#utils/projects/home.js`.
 * @module components/organisms/project-create
 */

import { html, define } from 'hybrids';
import { chooseCreateFolder, closeCreate, createProblem } from '#utils/projects/home.js';
import { homeState, setCreateName, submitCreate } from '#utils/projects/home.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ProjectCreateHost
 * @property {import('#utils/projects/home.js').HomeState} state
 */

/** @param {ProjectCreateHost} _host @param {Event} event */
function handleSubmit(_host, event) {
  event.preventDefault();
  submitCreate();
}

/** @param {ProjectCreateHost} _host @param {InputEvent} event */
function handleName(_host, event) {
  setCreateName(/** @type {HTMLInputElement} */ (event.target).value);
}

/**
 * @param {import('#utils/projects/home.js').CreateForm} form
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectCreateHost>}
 */
function body(form) {
  return html`
    <form id="project-create-form" class="project-create-form" onsubmit="${handleSubmit}">
      <div class="project-create-field">
        <span class="project-create-label" id="project-create-folder-label">Folder</span>
        <div class="project-create-folder">
          <output class="project-create-path" aria-labelledby="project-create-folder-label">
            ${form.path || 'No folder chosen yet'}
          </output>
          <button
            type="button"
            class="btn btn-secondary"
            data-autofocus="${form.path ? false : ''}"
            onclick="${chooseCreateFolder}"
          >
            <app-icon name="folder-open" size="sm"></app-icon>
            ${form.path ? 'Change…' : 'Choose folder…'}
          </button>
        </div>
        <span class="project-create-help">
          The folder with your footage, or an empty one to fill later. NearEdit adds a small
          <code>.nearedit</code> folder for the project file and never changes your media.
        </span>
      </div>
      ${form.hasProject
        ? html`<p class="project-create-existing" role="status">
            <app-icon name="info" size="sm"></app-icon>
            <span>
              This folder already holds a NearEdit project. It will be <strong>opened</strong> and
              added to your list — nothing is created or overwritten.
            </span>
          </p>`
        : html`<label class="project-create-field">
            <span class="project-create-label">Name</span>
            <input
              class="field-input"
              name="name"
              maxlength="200"
              autocomplete="off"
              placeholder="e.g. Park adventure"
              data-autofocus="${form.path ? '' : false}"
              value="${form.name}"
              oninput="${handleName}"
            />
          </label>`}
      ${form.error ? html`<p class="error-message" role="alert">${form.error}</p>` : html``}
    </form>
  `;
}

/**
 * @param {import('#utils/projects/home.js').CreateForm} form
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectCreateHost>}
 */
function footer(form) {
  return html`
    <button type="button" class="btn btn-secondary" onclick="${closeCreate}">Cancel</button>
    <button
      type="submit"
      form="project-create-form"
      class="btn btn-primary project-create-submit"
      disabled="${form.busy || Boolean(createProblem(form))}"
    >
      ${form.busy ? 'Working…' : form.hasProject ? 'Open project' : 'Create project'}
    </button>
  `;
}

/** @type {import('hybrids').Component<ProjectCreateHost>} */
export default define({
  tag: 'project-create',
  state: watch(homeState),
  render: {
    value: ({ state }) =>
      state.create
        ? html`<app-dialog open onclose="${closeCreate}">
            ${dialogFrame({
              title: 'New project',
              body: body(state.create),
              footer: footer(state.create),
              onClose: closeCreate,
            })}
          </app-dialog>`
        : html``,
    shadow: false,
  },
});
