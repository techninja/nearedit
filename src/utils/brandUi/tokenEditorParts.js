/**
 * Building blocks of the token editor's templates
 * (`<brand-token-editor>`): a row with the button that lets its token
 * follow the kit again and a remark under it, a choice, a switch, and the
 * hidden file picker a button opens.
 * @module utils/brandUi/tokenEditorParts
 */

import { html } from 'hybrids';
import { handleCommitInput, handleToggle } from '#utils/inspector/fieldEvents.js';
import { tokenAt } from './draft.js';
import * as on from './tokenEditorEvents.js';

/** @typedef {import('./tokenEditorEvents.js').TokenEditorHost} TokenEditorHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * The button that lets a token follow its kit again; it only shows for a
 * token the draft sets.
 * @param {TokenEditorHost} host
 * @param {string} path
 * @param {string} label
 * @returns {Template}
 */
export function resetButton({ changed }, path, label) {
  return html`<button
    type="button"
    class="icon-btn brand-token-reset"
    data-path="${path}"
    data-shown="${tokenAt(changed, path) === undefined ? 'false' : 'true'}"
    title="Back to what the kit says"
    aria-label="${`${label}: back to what the kit says`}"
    onclick="${on.handleReset}"
  >
    <app-icon name="reset" size="sm"></app-icon>
  </button>`;
}

/**
 * A row: a control and its reset button, with a remark under it.
 * @param {TokenEditorHost} host
 * @param {string} path
 * @param {string} label
 * @param {Template} control
 * @returns {Template}
 */
export function row(host, path, label, control) {
  const note = host.notes[path];
  return html`<div class="brand-token-row" data-path="${path}">
    ${control} ${resetButton(host, path, label)}
    ${note ? html`<p class="brand-token-note" role="note">${note}</p>` : html``}
  </div>`.key(path);
}

/**
 * A choice among the options of a `select` token.
 * @param {string} path
 * @param {string} label
 * @param {readonly string[]} options
 * @param {any} value
 * @returns {Template}
 */
export function choice(path, label, options, value) {
  return html`<label class="field-row">
    <span class="field-label">${label}</span>
    <select
      class="field-input"
      data-name="${path}"
      aria-label="${label}"
      onchange="${handleCommitInput}"
    >
      ${options.map(
        (option) =>
          html`<option value="${option}" selected="${option === value}">${option}</option>`,
      )}
    </select>
  </label>`;
}

/**
 * A switch for a yes-or-no token.
 * @param {string} path
 * @param {string} label
 * @param {boolean} value
 * @returns {Template}
 */
export function toggle(path, label, value) {
  return html`<label class="switch">
    <input
      type="checkbox"
      data-name="${path}"
      checked="${value === true}"
      onchange="${handleToggle}"
    />
    ${label}
  </label>`;
}

/**
 * The picker a button opens: hidden, reached through its button.
 * @param {string} path - The token the file is for
 * @param {string} accept - The kinds of file it offers
 * @returns {Template}
 */
export function picker(path, accept) {
  return html`<input
    type="file"
    hidden
    tabindex="-1"
    data-path="${path}"
    accept="${accept}"
    onchange="${on.handleFile}"
  />`;
}
