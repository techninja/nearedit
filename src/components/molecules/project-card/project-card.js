/**
 * Project card molecule — one project on the home page: name, folder,
 * how many adaptations, when it last changed. A project whose folder
 * cannot be read is flagged and cannot be opened. Announces
 * `projectforget` when its "remove from list" button is pressed.
 * @module components/molecules/project-card
 */

import { html, define, dispatch } from 'hybrids';
import { countOf, formatDateTime, timeAgo } from '#utils/ui/format.js';
import { projectUrl } from '#utils/ui/routes.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ProjectCardHost
 * @property {import('#utils/projects/api.js').Project} project
 */

/** @param {ProjectCardHost & HTMLElement} host */
function handleForget(host) {
  dispatch(host, 'projectforget', { detail: { project: host.project }, bubbles: true });
}

/**
 * @param {import('#utils/projects/api.js').Project} project
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectCardHost>}
 */
function details(project) {
  const changed = timeAgo(project.updatedAt);
  return html`
    <strong class="project-card-name">${project.name}</strong>
    ${project.description
      ? html`<span class="project-card-description">${project.description}</span>`
      : html``}
    <span class="project-card-path" title="${project.path}">
      <app-icon name="folder" size="sm"></app-icon>
      <span class="project-card-path-text"><bdi>${project.path}</bdi></span>
    </span>
    ${project.available
      ? html`<span class="project-card-meta">
          ${countOf(project.adaptations.length, 'adaptation')}
          ${changed
            ? html`<span title="${formatDateTime(project.updatedAt)}"> · changed ${changed}</span>`
            : html``}
        </span>`
      : html`<span class="project-card-missing" role="note">
          <app-icon name="alert" size="sm"></app-icon>
          Folder not available — is its drive connected?
        </span>`}
  `;
}

/** @type {import('hybrids').Component<ProjectCardHost>} */
export default define({
  tag: 'project-card',
  project: {
    value: /** @type {any} */ ({ id: '', name: '', path: '', available: true, adaptations: [] }),
  },
  render: {
    value: ({ project }) => html`
      <article class="project-card ${project.available ? '' : 'project-card-unavailable'}">
        ${project.available
          ? html`<a class="project-card-main" href="${projectUrl(project.id)}">
              ${details(project)}
            </a>`
          : html`<div class="project-card-main">${details(project)}</div>`}
        <button
          type="button"
          class="icon-btn project-card-forget"
          aria-label="${`Remove ${project.name} from the list`}"
          title="Remove from the list (no files are deleted)"
          onclick="${handleForget}"
        >
          <app-icon name="x" size="sm"></app-icon>
        </button>
      </article>
    `,
    shadow: false,
  },
});
