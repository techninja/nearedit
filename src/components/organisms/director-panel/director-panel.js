/**
 * Director panel organism — the assistant editor. Pick an action, say
 * where it applies and what you want, run it, and see what it did; every
 * result lands on the timeline as one undo step. The forms are generated
 * from `GET /api/director/actions`. State: `#utils/directorUi/state.js`.
 * @module components/organisms/director-panel
 */

import { html, define, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { isPlaying } from '#utils/playback/transport.js';
import { currentModes, loadDirector, reconcileMode } from '#utils/directorUi/controller.js';
import { syncHistory } from '#utils/directorUi/history.js';
import { directorState, resetDirector } from '#utils/directorUi/state.js';
import { formView } from '#utils/directorUi/formView.js';
import { listView } from '#utils/directorUi/listView.js';
import { handleDirectorEvent } from '#utils/directorUi/panelEvents.js';
import { scriptModes } from '#utils/directorUi/scripts.js';
import { watch } from '#utils/ui/observable.js';
import '#molecules/director-progress/index.js';
import '#molecules/director-scripts/index.js';

/**
 * @typedef {Object} DirectorPanelHost
 * @property {import('#utils/directorUi/state.js').DirectorState} state
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 * @property {import('#store/ViewState.js').ViewStateShape} view
 * @property {string} facts - What of the editor the form depends on, as one comparable value
 * @property {string} showing - Which view is up; a change scrolls the panel back to its top
 * @property {boolean} wired - Internal: loads the schemas and follows the document
 */

/** @param {DirectorPanelHost} _host @param {CustomEvent} event */
function handleEvent(_host, event) {
  handleDirectorEvent(event);
}

/**
 * Load what the panel needs and keep the run history in step with undo
 * and redo done elsewhere.
 * @returns {() => void} disconnect
 */
function connectPanel() {
  loadDirector();
  return onDocChange((doc) => {
    const { history } = directorState.get();
    const synced = syncHistory(history, doc);
    if (synced !== history) directorState.set({ history: synced });
  });
}

/**
 * The parts of the view state the form shows. The playhead moves on every
 * frame while playing; it is left out then, so playback does not re-render.
 * @param {DirectorPanelHost} host
 * @returns {string}
 */
function editorFacts({ view }) {
  const at = isPlaying() ? view.cursorPosition : view.playheadPosition;
  return JSON.stringify([view.selection, view.loopStart, view.loopEnd, at]);
}

/** @param {DirectorPanelHost} host @returns {any} */
function content(host) {
  const { state, project, facts } = host;
  if (!project.loaded || !facts)
    return html`<p class="empty-state">Open an adaptation to work with the director.</p>`;
  if (state.loadError)
    return html`<div class="empty-state" role="alert">
      <strong>The director could not be loaded</strong><span>${state.loadError}</span>
      <button type="button" class="btn btn-secondary" onclick="${loadDirector}">Try again</button>
    </div>`;
  if (state.run) return html`<director-progress run="${state.run}"></director-progress>`;
  const action = state.actions.find((a) => a.id === state.actionId);
  return action ? formView(state, action, currentModes(action)) : listView(state, getDoc());
}

/** @type {import('hybrids').Component<DirectorPanelHost>} */
export default define({
  tag: 'director-panel',
  state: watch(directorState),
  project: {
    ...store(ProjectState),
    observe: (_host, project, last) => {
      if (last && project.adaptationId !== last.adaptationId) resetDirector();
    },
  },
  view: store(ViewState),
  facts: { value: editorFacts, observe: reconcileMode },
  showing: {
    value: ({ state }) => [state.actionId, Boolean(state.run), Boolean(state.result)].join(),
    observe: (host, _value, last) => {
      // A new view, or a fresh result at its top, starts at the top — not
      // wherever the previous view happened to be scrolled to.
      if (last !== undefined) host.scrollIntoView({ block: 'start', inline: 'nearest' });
    },
  },
  wired: { value: true, connect: connectPanel },
  render: {
    value: (host) => html`
      <div
        class="director-panel"
        onactionpick="${handleEvent}"
        onfieldchange="${handleEvent}"
        onruncancel="${handleEvent}"
        onrunundo="${handleEvent}"
        onscriptpick="${handleEvent}"
        onscriptedit="${handleEvent}"
        onscriptmode="${handleEvent}"
        onscriptclose="${handleEvent}"
        onscriptbuild="${handleEvent}"
      >
        ${content(host)}
        ${host.state.scripts
          ? html`<director-scripts review="${host.state.scripts}" modes="${scriptModes()}">
            </director-scripts>`
          : html``}
      </div>
    `,
    shadow: false,
  },
});
