/**
 * The director panel's list view as a template function: the first-use
 * hint, the note about a missing language model, the actions, and what
 * the director did in this session.
 * @module utils/directorUi/listView
 */

import { html } from 'hybrids';
import { LLM_DOCS, llmProblem } from '#utils/directorUi/availability.js';
import { dismissHint, hintWanted, refreshLlm } from '#utils/directorUi/controller.js';
import { undoKind } from '#utils/directorUi/history.js';
import { showScriptReview } from '#utils/directorUi/scripts.js';
import '#atoms/app-icon/index.js';
import '#molecules/director-actions/index.js';
import '#molecules/director-history/index.js';

/** @typedef {import('#utils/directorUi/state.js').DirectorState} DirectorState */

/** @param {DirectorState} state @returns {any} */
function notices(state) {
  const llmDown = state.llm && !state.llm.available;
  return html`
    ${hintWanted()
      ? html`<div class="app-callout" role="note">
          <app-icon name="info" size="sm"></app-icon>
          <span class="app-callout-body">
            <span>
              New here? Start with <strong>Base edit</strong>: it builds a rough cut from your
              analysed media — no AI needed. Everything the director does is one step you can undo.
            </span>
          </span>
          <button
            type="button"
            class="icon-btn"
            aria-label="Dismiss this hint"
            onclick="${dismissHint}"
          >
            <app-icon name="x" size="sm"></app-icon>
          </button>
        </div>`
      : html``}
    ${llmDown
      ? html`<p class="director-panel-llm" role="note">
          ${llmProblem(state.llm)} The AI actions are switched off; the others work as usual. Setup:
          <code>${LLM_DOCS}</code>.
          <button type="button" class="director-panel-link" onclick="${refreshLlm}">
            Check again
          </button>
        </p>`
      : html``}
  `;
}

/**
 * @param {DirectorState} state
 * @param {any} doc - The current document, to tell how each run can be undone
 * @returns {any}
 */
export function listView(state, doc) {
  const runs = state.history.map((run) => ({ ...run, kind: undoKind(run, doc) }));
  return html`
    ${notices(state)}
    ${state.scripts
      ? html`<button
          type="button"
          class="btn btn-secondary director-panel-review"
          onclick="${() => showScriptReview(true)}"
        >
          <app-icon name="file-text" size="sm"></app-icon>
          Review the ${state.scripts.options.length} script options
        </button>`
      : html``}
    <director-actions actions="${state.actions}" llm="${state.llm || {}}"></director-actions>
    ${state.actions.length
      ? html``
      : html`<p class="empty-state"><span class="spinner"></span></p>`}
    <director-history runs="${runs}"></director-history>
  `;
}
