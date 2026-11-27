/**
 * Project list organism — the home page's content: the projects as cards,
 * the way to add one, and a first-run explanation while there are none.
 * State lives in `#utils/projects/home.js`.
 * @module components/organisms/project-list
 */

import { html, define } from 'hybrids';
import { forgetProject, homeState, loadProjects, openCreate } from '#utils/projects/home.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';
import '#molecules/project-card/index.js';

/**
 * @typedef {Object} ProjectListHost
 * @property {import('#utils/projects/home.js').HomeState} state
 * @property {boolean} loader - Internal: loads the list when connected
 */

const STEPS = [
  {
    icon: 'folder-open',
    title: 'Pick a folder of footage',
    text: 'A project lives in a folder on this server. Video, audio and stills in it become your media; nothing is ever changed or moved.',
  },
  {
    icon: 'scan',
    title: 'Analyse',
    text: 'NearEdit finds shots, pauses and beats — and transcribes speech and describes pictures when those providers are set up.',
  },
  {
    icon: 'split',
    title: 'Edit',
    text: 'Let the director lay out a rough cut, then trim, slip and cross-fade on the timeline and export.',
  },
];

/** @param {ProjectListHost} _host @param {CustomEvent} event */
function handleForget(_host, event) {
  forgetProject(event.detail.project);
}

/** @returns {import('hybrids').UpdateFunctionWithMethods<ProjectListHost>} */
function firstRun() {
  return html`
    <section class="project-list-welcome" aria-labelledby="project-list-welcome-title">
      <h2 id="project-list-welcome-title">Welcome to NearEdit</h2>
      <p class="project-list-lead">
        A video editor in your browser that works next to your footage. An assistant editor builds
        the rough cut; you make it yours on the timeline.
      </p>
      <ol class="project-list-steps">
        ${STEPS.map(
          (step, index) => html`
            <li>
              <span class="project-list-step-icon">
                <app-icon name="${step.icon}" size="md"></app-icon>
              </span>
              <strong>${index + 1}. ${step.title}</strong>
              <span>${step.text}</span>
            </li>
          `,
        )}
      </ol>
      <button type="button" class="btn btn-primary" onclick="${openCreate}">
        <app-icon name="plus" size="sm"></app-icon> Create your first project
      </button>
    </section>
  `;
}

/**
 * @param {import('#utils/projects/home.js').HomeState} state
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectListHost>}
 */
function content(state) {
  if (state.error)
    return html`
      <div class="empty-state" role="alert">
        <app-icon name="alert" size="lg"></app-icon>
        <strong>The projects could not be loaded</strong>
        <span>${state.error}</span>
        <button type="button" class="btn btn-secondary" onclick="${loadProjects}">Try again</button>
      </div>
    `;
  if (state.loading && !state.projects.length)
    return html`<div class="empty-state"><span class="spinner"></span> Loading projects…</div>`;
  if (!state.projects.length) return firstRun();
  return html`
    <header class="project-list-header">
      <h2>Projects</h2>
      <button type="button" class="btn btn-primary" onclick="${openCreate}">
        <app-icon name="plus" size="sm"></app-icon> New project
      </button>
    </header>
    <ul class="project-list-grid" onprojectforget="${handleForget}">
      ${state.projects.map((project) =>
        html`<li><project-card project="${project}"></project-card></li>`.key(project.id),
      )}
    </ul>
  `;
}

/** @type {import('hybrids').Component<ProjectListHost>} */
export default define({
  tag: 'project-list',
  state: watch(homeState),
  loader: {
    value: true,
    connect: () => {
      loadProjects();
    },
  },
  render: {
    value: ({ state }) => html`<div class="project-list">${content(state)}</div>`,
    shadow: false,
  },
});
