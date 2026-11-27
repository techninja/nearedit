/**
 * Renders organism — the finished renders of a project, newest first,
 * with open, download and delete. State: `#utils/projects/projectPage.js`
 * (`GET /api/renders`).
 * @module components/organisms/project-renders
 */

import { html, define } from 'hybrids';
import { removeRender } from '#utils/projects/projectActions.js';
import { projectPageState } from '#utils/projects/projectPage.js';
import { formatBytes, formatDateTime, formatDuration, timeAgo } from '#utils/ui/format.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} ProjectRendersHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 */

/** @param {ProjectRendersHost} host @param {MouseEvent} event */
function handleDelete(host, event) {
  const { file } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const render = host.state.renders.find((r) => r.file === file);
  if (render) removeRender(render);
}

/**
 * @param {any} render - One entry of `GET /api/renders`
 * @param {import('#utils/projects/api.js').Adaptation[]} adaptations
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectRendersHost>}
 */
function rowTemplate(render, adaptations) {
  const from = adaptations.find((a) => a.id === render.adaptationId)?.name;
  const facts = [
    from,
    render.width && render.height ? `${render.width}×${render.height}` : '',
    render.duration ? formatDuration(render.duration) : '',
    formatBytes(render.size),
  ].filter(Boolean);
  return html`
    <li class="project-renders-row">
      <app-icon name="file-video" size="sm"></app-icon>
      <div class="project-renders-text">
        <a class="project-renders-name" href="${render.url}" target="_blank" rel="noopener">
          ${render.file}
        </a>
        <span class="project-renders-facts">
          ${facts.join(' · ')}
          <span title="${formatDateTime(render.createdAt)}"> · ${timeAgo(render.createdAt)}</span>
        </span>
      </div>
      <a
        class="icon-btn"
        href="${`${render.url}?download`}"
        download
        aria-label="${`Download ${render.file}`}"
        title="Download"
      >
        <app-icon name="export" size="sm"></app-icon>
      </a>
      <button
        type="button"
        class="icon-btn"
        data-file="${render.file}"
        aria-label="${`Delete ${render.file}`}"
        title="Delete this render"
        onclick="${handleDelete}"
      >
        <app-icon name="trash" size="sm"></app-icon>
      </button>
    </li>
  `.key(render.file);
}

/** @type {import('hybrids').Component<ProjectRendersHost>} */
export default define({
  tag: 'project-renders',
  state: watch(projectPageState),
  render: {
    value: ({ state }) => html`
      <section class="app-card" aria-labelledby="project-renders-title">
        <header class="app-card-header">
          <h2 class="app-card-title" id="project-renders-title">
            <app-icon name="clapperboard" size="sm"></app-icon> Renders
          </h2>
        </header>
        ${state.renders.length
          ? html`<ul class="project-renders-list">
              ${state.renders.map((r) => rowTemplate(r, state.project?.adaptations || []))}
            </ul>`
          : html`<p class="app-card-body app-muted">
              Nothing rendered yet. Open an adaptation and press Export — finished files are kept on
              the server and listed here.
            </p>`}
      </section>
    `,
    shadow: false,
  },
});
