/**
 * The director panel's form view as a template function: one action's
 * prompt, where it applies, its fields (generated from the schema), what
 * the last run did, and the Run button.
 * @module utils/directorUi/formView
 */

import { html } from 'hybrids';
import { getLibrary } from '#utils/media/library.js';
import { actionState, llmProblem } from '#utils/directorUi/availability.js';
import { closeAction, setDirectorField } from '#utils/directorUi/controller.js';
import { fieldGroups, usesLlm } from '#utils/directorUi/form.js';
import { runForm } from '#utils/directorUi/run.js';
import '#atoms/app-icon/index.js';
import '#molecules/director-form/index.js';
import '#molecules/director-modes/index.js';

/** @typedef {import('#utils/directorUi/state.js').DirectorState} DirectorState */

/** @param {unknown} _host @param {InputEvent} event */
function handlePrompt(_host, event) {
  setDirectorField('prompt', /** @type {HTMLTextAreaElement} */ (event.target).value);
}

/** @param {DirectorState} state @returns {any} */
function outcome(state) {
  if (state.error)
    return html`<div class="app-callout app-callout-error" role="alert">
      <app-icon name="alert" size="sm"></app-icon>
      <div class="app-callout-body">
        <strong>${state.error.message}</strong>
        ${state.error.detail ? html`<span>${state.error.detail}</span>` : html``}
      </div>
    </div>`;
  if (!state.result) return html``;
  const { title, summary, notes } = state.result;
  return html`<div class="app-callout app-callout-success director-panel-done" role="status">
    <app-icon name="success" size="sm"></app-icon>
    <div class="app-callout-body">
      <strong>${title} — done</strong>
      <span>${summary}</span>
      ${notes.length
        ? html`<ul class="director-panel-notes">
            ${notes.map((note) => html`<li>${note}</li>`)}
          </ul>`
        : html``}
    </div>
  </div>`;
}

/**
 * @param {DirectorState} state
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @param {import('#utils/directorUi/modes.js').ModeChoice[]} modes
 * @returns {any}
 */
export function formView(state, action, modes) {
  const groups = fieldGroups(action);
  const files = getLibrary().filter((item) => item.type === 'text');
  const blocked = usesLlm(action, state.values) && !actionState({ llm: 'yes' }, state.llm).enabled;
  const fields = (/** @type {any[]} */ list) =>
    html`<director-form
      fields="${list}"
      values="${state.values}"
      problems="${state.problems}"
      llm="${state.llm || {}}"
      files="${files}"
    ></director-form>`;
  return html`
    <header class="director-panel-head">
      <button
        type="button"
        class="icon-btn"
        aria-label="Back to all actions"
        title="All actions"
        onclick="${closeAction}"
      >
        <app-icon name="chevron-left" size="sm"></app-icon>
      </button>
      <h3>${action.title}</h3>
    </header>
    <p class="director-panel-about">${action.description}</p>
    ${outcome(state)}
    ${action.prompt
      ? html`<label class="director-panel-prompt">
          <span>${action.prompt.label}</span>
          <textarea
            class="field-input"
            name="prompt"
            rows="4"
            placeholder="${action.prompt.placeholder}"
            value="${state.prompt}"
            oninput="${handlePrompt}"
          ></textarea>
          ${state.problems.prompt
            ? html`<span class="error-message">${state.problems.prompt}</span>`
            : html``}
        </label>`
      : html``}
    ${modes.length
      ? html`<director-modes
          choices="${modes}"
          mode="${state.mode}"
          problem="${state.problems.mode || state.problems['context.range'] || ''}"
        ></director-modes>`
      : html``}
    ${fields(groups.main)}
    ${groups.more.length
      ? html`<details class="director-panel-more">
          <summary>More options (${groups.more.length})</summary>
          ${fields(groups.more)}
        </details>`
      : html``}
    <footer class="director-panel-run">
      ${blocked ? html`<span class="director-panel-llm">${llmProblem(state.llm)}</span>` : html``}
      <button type="button" class="btn btn-primary" disabled="${blocked}" onclick="${runForm}">
        <app-icon name="${action.llm === 'no' ? 'wand' : 'ai'}" size="sm"></app-icon>
        ${action.jobType === 'script' ? 'Write the scripts' : `Run ${action.title.toLowerCase()}`}
      </button>
    </footer>
  `;
}
