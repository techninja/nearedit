/**
 * Template helpers for the layout of inspector groups: a heading with a
 * reset button, and two value boxes side by side.
 * @module utils/inspector/groupTemplates
 */

import { html } from 'hybrids';
import { handleButton } from './fieldEvents.js';
import { numberField } from './fieldTemplates.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * A group heading with a reset button.
 * @param {string} title
 * @param {string} reset - `reset.*` field name the button reports
 * @param {boolean} disabled
 * @param {string} [hint] - Tooltip; "Reset <title>" by default
 * @returns {Template}
 */
export function groupHeading(title, reset, disabled, hint = `Reset ${title.toLowerCase()}`) {
  return html`<div class="field-group-title clip-inspector-group-heading">
    <span>${title}</span>
    <button
      type="button"
      class="icon-btn"
      data-name="${reset}"
      title="${hint}"
      aria-label="${hint}"
      disabled="${disabled}"
      onclick="${handleButton}"
    >
      <app-icon name="undo" size="sm"></app-icon>
    </button>
  </div>`;
}

/**
 * Two compact value boxes side by side (X / Y, top / bottom…).
 * @param {import('./model.js').InspectorModel} model
 * @param {[string, string]} first - `[field path, short label]`
 * @param {[string, string]} second
 * @returns {Template}
 */
export function fieldPair(model, first, second) {
  return html`<span class="field-pair">
    ${numberField(model, first[0], first[1], { compact: true })}
    ${numberField(model, second[0], second[1], { compact: true })}
  </span>`;
}
