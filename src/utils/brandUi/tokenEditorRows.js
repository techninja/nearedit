/**
 * Rows of the token editor for the tokens of a simple type in
 * `TOKEN_SCHEMA`: a colour (with a remark when it would be hard to read),
 * a number in its range, a choice, a switch, a line of text.
 * @module utils/brandUi/tokenEditorRows
 */

import { html } from 'hybrids';
import { handleCommitInput, handleLiveInput } from '#utils/inspector/fieldEvents.js';
import { tokenAt } from './draft.js';
import * as on from './tokenEditorEvents.js';
import { choice, row, toggle } from './tokenEditorParts.js';

/** @typedef {import('./tokenEditorEvents.js').TokenEditorHost} TokenEditorHost */
/** @typedef {import('./tokenFields.js').TokenField} TokenField */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * One token of a simple type as a row.
 * @param {TokenEditorHost} host
 * @param {TokenField} field
 * @returns {Template}
 */
export function tokenRow(host, { path, spec }) {
  const value = tokenAt(host.tokens, path);
  const { label, type } = spec;
  if (type === 'color') {
    // A derived colour shows what was worked out; choosing one sets it, the reset button frees it.
    const about = spec.derived ? 'Black or white, whichever reads — unless you choose' : label;
    const control = html`<field-color
      name="${path}"
      label="${label}"
      value="${value || ''}"
      fallback="${value || '#000000'}"
      title="${spec.description || about}"
    ></field-color>`;
    return row(host, path, label, control);
  }
  if (type === 'number') {
    const range = { min: spec.min, max: spec.max, step: spec.step, unit: spec.unit || '' };
    const control = html`<field-number
      name="${path}"
      label="${label}"
      value="${Number.isFinite(value) ? value : 0}"
      spec="${range}"
    ></field-number>`;
    return row(host, path, label, control);
  }
  if (type === 'select') {
    return row(host, path, label, choice(path, label, spec.options, value, spec.description));
  }
  if (type === 'boolean') return row(host, path, label, toggle(path, label, value));
  const control = html`<label class="field-row">
    <span class="field-label">${label}</span>
    <input
      class="field-input"
      type="text"
      data-name="${path}"
      aria-label="${label}"
      maxlength="${spec.max || 200}"
      title="${spec.description || label}"
      value="${value ?? ''}"
      oninput="${handleLiveInput}"
      onchange="${handleCommitInput}"
      onkeydown="${on.handleKeys}"
    />
  </label>`;
  return row(host, path, label, control);
}
