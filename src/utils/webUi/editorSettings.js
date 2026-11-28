/**
 * What the web editor shows in place of a step's form while the end of the
 * recording is selected: what to do next, and the settings of the whole
 * recording — the rest before the first step and after the last, and what
 * a step does when its target is not on the page.
 * @module utils/webUi/editorSettings
 */

import { html } from 'hybrids';
import { ON_MISSING, RECIPE_LIMITS } from '#utils/web/index.js';
import { handleChoice } from './topbarEvents.js';

const MISSING_NAMES = {
  fail: 'Stop the recording and say which step',
  skip: 'Skip the step and carry on',
};

/**
 * @param {string} name - `lead` or `tail`
 * @param {string} label
 * @param {number} value - Seconds
 * @param {boolean} locked
 */
function seconds(name, label, value, locked) {
  return html`<label class="field-row">
    <span class="field-label" title="${label}">${label}</span>
    <input
      class="field-input field-num"
      type="number"
      data-name="${name}"
      data-type="number"
      aria-label="${label}"
      min="0"
      max="${RECIPE_LIMITS.seconds}"
      step="0.1"
      value="${value}"
      disabled="${locked}"
      onchange="${handleChoice}"
    />
  </label>`;
}

/**
 * @param {import('#utils/web/types.js').Recipe} recipe
 * @param {boolean} locked
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function settingsForm(recipe, locked) {
  return html`<div class="web-editor-settings">
    <p class="app-muted">
      ${recipe.steps.length
        ? 'This is the page after every step. '
        : 'This is the page as it loads. '}Press
      something on it to add a step — a click, typing, a scroll, a zoom — or add one from the menu
      above. Select a step to change it.
    </p>
    <div class="field-group-title">The whole recording</div>
    ${seconds('lead', 'Rest before (s)', recipe.lead, locked)}
    ${seconds('tail', 'Rest after (s)', recipe.tail, locked)}
    <label class="field-row">
      <span class="field-label" title="When a step's target is not on the page"
        >Missing target</span
      >
      <select
        class="field-input"
        data-name="onMissing"
        aria-label="When a step's target is not on the page"
        disabled="${locked}"
        onchange="${handleChoice}"
      >
        ${ON_MISSING.map(
          (id) =>
            html`<option value="${id}" selected="${id === recipe.onMissing}">
              ${MISSING_NAMES[id]}
            </option>`,
        )}
      </select>
    </label>
  </div>`;
}
