/**
 * Project settings organism — name, description, and the folders the
 * project takes its media from (the project folder plus any extra ones,
 * added with the folder browser). State: `#utils/projects/projectPage.js`.
 * @module components/organisms/project-settings
 */

import { html, define } from 'hybrids';
import { addMediaFolder, removeMediaFolder, saveSettings } from '#utils/projects/projectActions.js';
import { projectPageState } from '#utils/projects/projectPage.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ProjectSettingsHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 * @property {string} name - Edited name; '' until the user types
 * @property {string} description
 * @property {boolean} dirty - The user changed name or description
 * @property {boolean} saving
 */

/** @param {ProjectSettingsHost} host @param {InputEvent} event */
function handleInput(host, event) {
  const { project } = host.state;
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (!host.dirty) {
    host.name = project.name;
    host.description = project.description;
    host.dirty = true;
  }
  host[/** @type {'name'|'description'} */ (input.name)] = input.value;
}

/** @param {ProjectSettingsHost} host @param {Event} event */
async function handleSubmit(host, event) {
  event.preventDefault();
  host.saving = true;
  const saved = await saveSettings({ name: host.name, description: host.description });
  host.saving = false;
  if (saved) host.dirty = false;
}

/** @param {ProjectSettingsHost} _host @param {MouseEvent} event */
function handleRemoveFolder(_host, event) {
  removeMediaFolder(/** @type {HTMLElement} */ (event.currentTarget).dataset.path);
}

/**
 * @param {import('#utils/projects/api.js').Project} project
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectSettingsHost>}
 */
function folders(project) {
  return html`
    <div class="project-settings-folders">
      <h3>Media folders</h3>
      <ul>
        <li>
          <app-icon name="folder" size="sm"></app-icon>
          <span class="project-settings-path" title="${project.path}"
            ><bdi>${project.path}</bdi></span
          >
          <span class="chip">Project folder</span>
        </li>
        ${project.mediaFolders.map(
          (path) => html`
            <li>
              <app-icon name="folder" size="sm"></app-icon>
              <span class="project-settings-path" title="${path}"><bdi>${path}</bdi></span>
              <button
                type="button"
                class="icon-btn"
                data-path="${path}"
                aria-label="${`Stop using ${path}`}"
                title="Stop using this folder (nothing is deleted)"
                onclick="${handleRemoveFolder}"
              >
                <app-icon name="x" size="sm"></app-icon>
              </button>
            </li>
          `,
        )}
      </ul>
      <button type="button" class="btn btn-secondary" onclick="${addMediaFolder}">
        <app-icon name="folder-plus" size="sm"></app-icon> Add a media folder…
      </button>
      <p class="app-muted">
        Footage on another drive or a shared library can stay where it is — add its folder here.
      </p>
    </div>
  `;
}

/** @type {import('hybrids').Component<ProjectSettingsHost>} */
export default define({
  tag: 'project-settings',
  state: watch(projectPageState),
  name: '',
  description: '',
  dirty: false,
  saving: false,
  render: {
    value: ({ state, name, description, dirty, saving }) => {
      const { project } = state;
      if (!project) return html``;
      return html`
        <section class="app-card" aria-labelledby="project-settings-title">
          <header class="app-card-header">
            <h2 class="app-card-title" id="project-settings-title">
              <app-icon name="settings" size="sm"></app-icon> Project
            </h2>
          </header>
          <form class="app-card-body project-settings-form" onsubmit="${handleSubmit}">
            <label>
              <span>Name</span>
              <input
                class="field-input"
                name="name"
                maxlength="200"
                autocomplete="off"
                value="${dirty ? name : project.name}"
                oninput="${handleInput}"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                class="field-input"
                name="description"
                rows="3"
                maxlength="5000"
                placeholder="What is this project about?"
                value="${dirty ? description : project.description}"
                oninput="${handleInput}"
              ></textarea>
            </label>
            <button type="submit" class="btn btn-primary" disabled="${!dirty || saving}">
              ${saving ? 'Saving…' : 'Save'}
            </button>
          </form>
          ${folders(project)}
        </section>
      `;
    },
    shadow: false,
  },
});
