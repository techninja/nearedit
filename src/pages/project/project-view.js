/**
 * Project page — a project's adaptations (the way into the editor), its
 * media and analysis, what the server has set up, finished renders, and
 * the project's settings.
 * @module pages/project
 */

import { html, define, router } from 'hybrids';
import EditorView from '#pages/editor/index.js';
import { openProjectPage, projectPageState, reloadProject } from '#utils/projects/projectPage.js';
import { watch } from '#utils/ui/observable.js';
import { HOME_URL } from '#utils/ui/routes.js';
import { setPageTitle } from '#utils/ui/title.js';
import '#atoms/app-icon/index.js';
import '#atoms/theme-toggle/index.js';
import '#organisms/adaptation-dialog/index.js';
import '#organisms/adaptation-tree/index.js';
import '#organisms/job-tray/index.js';
import '#organisms/project-media/index.js';
import '#organisms/project-providers/index.js';
import '#organisms/project-renders/index.js';
import '#organisms/project-settings/index.js';

/**
 * @typedef {Object} ProjectViewHost
 * @property {string} projectId - From the URL
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 */

/** @type {WeakMap<object, () => void>} Leaving the page: host → close function */
const closers = new WeakMap();

/**
 * Open the project named in the URL (again when the URL changes).
 * @param {ProjectViewHost} host
 * @param {string} projectId
 */
function openProject(host, projectId) {
  closers.get(host)?.();
  closers.delete(host);
  if (projectId) closers.set(host, openProjectPage(projectId));
}

/** @param {ProjectViewHost} host @returns {any} */
function content({ state }) {
  if (state.notFound)
    return html`
      <div class="app-full-state">
        <app-icon name="search" size="lg"></app-icon>
        <h1>Project not found</h1>
        <p>
          This server has no project with that address. It may have been removed from the list — its
          files are still in its folder and it can be added again from there.
        </p>
        <a class="btn btn-primary" href="${HOME_URL}">Go to your projects</a>
      </div>
    `;
  if (state.error)
    return html`
      <div class="app-full-state" role="alert">
        <app-icon name="alert" size="lg"></app-icon>
        <h1>The project could not be loaded</h1>
        <p>${state.error}</p>
        <button type="button" class="btn btn-primary" onclick="${reloadProject}">Try again</button>
        <a href="${HOME_URL}">Back to your projects</a>
      </div>
    `;
  if (!state.project)
    return html`<div class="app-full-state">
      <span class="spinner"></span> Loading the project…
    </div>`;
  return html`
    <div class="project-view-grid">
      <div class="project-view-column">
        <adaptation-tree></adaptation-tree>
        <project-media></project-media>
        <project-renders></project-renders>
      </div>
      <div class="project-view-column">
        <project-settings></project-settings>
        <project-providers></project-providers>
      </div>
    </div>
    <adaptation-dialog></adaptation-dialog>
  `;
}

/** @type {import('hybrids').Component<ProjectViewHost>} */
export default define({
  tag: 'project-view',
  [router.connect]: { url: '/project/:projectId', stack: [EditorView] },
  projectId: { value: '', observe: openProject },
  state: watch(projectPageState),
  render: {
    value: (host) => {
      const name = host.state.project?.name || '';
      return html`
        <header class="app-bar">
          <a class="app-bar-back" href="${HOME_URL}" aria-label="All projects">
            <app-icon name="chevron-left" size="sm"></app-icon> Projects
          </a>
          <h1 class="app-bar-title">${name}</h1>
          <job-tray project-id="${host.projectId}"></job-tray>
          <theme-toggle></theme-toggle>
        </header>
        <main class="app-page">${content(host)}</main>
      `;
    },
    shadow: false,
    connect: (host) => () => openProject(host, ''),
    observe: ({ state }) => {
      setPageTitle(state.project?.name || (state.notFound ? 'Project not found' : 'Project'));
    },
  },
});
