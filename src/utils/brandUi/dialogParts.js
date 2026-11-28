/**
 * The inside of the Brand dialog (`<brand-dialog>`) as templates: the view
 * that chooses a kit, the view that customises one beside its live
 * preview, and the notices both show — what was done, what went wrong,
 * and how many element clips are out of date.
 * @module utils/brandUi/dialogParts
 */

import { html } from 'hybrids';
import { staleNotice } from './createParts.js';
import * as edits from './dialogDraftEvents.js';
import * as on from './dialogEvents.js';
import { staleInfo } from './stale.js';
import { contrastNotes } from './tokenFields.js';

/** @typedef {import('./dialogEvents.js').BrandDialogHost} BrandDialogHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** Problems of a kit shown at most. */
const MOST_PROBLEMS = 5;

/**
 * What went wrong, what was done, and what is out of date.
 * @param {BrandDialogHost} host
 * @returns {Template}
 */
export function notices({ state, kit, doc }) {
  const stale = staleInfo(doc, kit.effective);
  return html`<div class="brand-dialog-notices">
    ${state.error
      ? html`<div class="error-message" role="alert">
          <p>${state.error}</p>
          ${state.problems.length
            ? html`<ul>
                ${state.problems
                  .slice(0, MOST_PROBLEMS)
                  .map((problem) => html`<li><code>${problem.path}</code> ${problem.message}</li>`)}
              </ul>`
            : html``}
        </div>`
      : html``}
    ${state.said ? html`<p class="success-message" role="status">${state.said}</p>` : html``}
    ${staleNotice(stale, on.handleUpdate)}
  </div>`;
}

/** @param {BrandDialogHost} host @returns {Template} */
export function chooseBody(host) {
  const { state, kit, timeline } = host;
  const offline = state.list === 'failed' || kit.status === 'fallback';
  return html`<div class="brand-dialog-choose">
    <p class="brand-dialog-about">
      A brand kit is the look every element takes — its colours, its fonts, the logo, the way things
      move. Choose one, or customise the one in use for this project.
    </p>
    ${offline
      ? html`<p class="brand-dialog-offline" role="status">
          The server gave no kits, so the built-in ones are shown and Clean is in use. Choosing and
          saving need the server.
        </p>`
      : html``}
    <brand-kit-list
      data-autofocus
      kits="${state.kits}"
      current="${kit.choice}"
      own="${kit.choice === 'project' ? kit.effective : null}"
      like="${timeline}"
      busy="${Boolean(state.busy)}"
      onkit-choose="${on.handleChoose}"
      onkit-remove="${on.handleRemove}"
    ></brand-kit-list>
    ${notices(host)}
  </div>`;
}

/** @param {BrandDialogHost} host @returns {Template} */
export function customiseBody(host) {
  const { draft, timeline } = host;
  return html`<div
    class="brand-dialog-customise"
    onfield-change="${edits.handleToken}"
    ontoken-reset="${edits.handleReset}"
    ontoken-file="${edits.handleFile}"
  >
    <div class="brand-dialog-form">
      <p class="brand-dialog-about">
        Changing <strong>${draft.base.name}</strong> for this project. What you leave alone keeps
        following it.
      </p>
      <brand-token-editor
        data-autofocus
        tokens="${draft.preview.tokens}"
        changed="${draft.draft?.tokens || {}}"
        fonts="${draft.preview.fonts || []}"
        notes="${contrastNotes(draft.preview.tokens)}"
        problem="${draft.problem}"
      ></brand-token-editor>
    </div>
    <div class="brand-dialog-look">
      ${notices(host)}
      <brand-preview kit="${draft.preview}" like="${timeline}"></brand-preview>
    </div>
  </div>`;
}
