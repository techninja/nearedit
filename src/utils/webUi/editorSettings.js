/**
 * What the web editor shows in place of a step's form while the end of the
 * recording is selected: what to do next, and the settings of the whole
 * recording — the rest before the first step and after the last, what a
 * step does when its target is not on the page, and what is removed from
 * the page before recording (`hide`).
 * @module utils/webUi/editorSettings
 */

import { html } from 'hybrids';
import { ON_MISSING, RECIPE_LIMITS, describeTarget } from '#utils/web/index.js';
import { webClipOf, webEditorState } from './editorState.js';
import { setField } from './edits.js';

const MISSING_NAMES = {
  fail: 'Stop the recording and say which step',
  skip: 'Skip the step and carry on',
};

/**
 * A setting of the whole recording changed. (The dialog itself renders
 * these controls, so the change goes straight to the recipe.)
 * @param {any} _host
 * @param {Event} event
 */
function handleSetting(_host, event) {
  const control = /** @type {HTMLInputElement} */ (event.target);
  const number = control.dataset.type === 'number';
  if (number && (control.value.trim() === '' || !Number.isFinite(Number(control.value)))) return;
  const value = number ? Number(control.value) : control.value;
  setField(webEditorState.get().clipId, control.dataset.name, value);
}

/** Take a target off the list of what is hidden before recording. @param {any} _host @param {Event} event */
function handleUnhide(_host, event) {
  const at = Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.index);
  const { clipId } = webEditorState.get();
  const hide = webClipOf(clipId)?.clip.web.recipe.hide || [];
  setField(
    clipId,
    'hide',
    hide.filter((_target, index) => index !== at),
  );
}

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
      onchange="${handleSetting}"
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
        onchange="${handleSetting}"
      >
        ${ON_MISSING.map(
          (id) =>
            html`<option value="${id}" selected="${id === recipe.onMissing}">
              ${MISSING_NAMES[id]}
            </option>`,
        )}
      </select>
    </label>
    ${recipe.hide.length
      ? html`<div class="field-row">
          <span class="field-label" title="Removed from the page before recording"
            >Hidden first</span
          >
          <span class="toolbar-group web-editor-hidden">
            ${recipe.hide.map(
              (target, index) =>
                html`<span class="chip">
                  ${describeTarget(target)}
                  <button
                    type="button"
                    class="icon-btn"
                    data-index="${index}"
                    aria-label="${`Show ${describeTarget(target)} again`}"
                    title="Do not hide it"
                    disabled="${locked}"
                    onclick="${handleUnhide}"
                  >
                    ×
                  </button>
                </span>`,
            )}
          </span>
        </div>`
      : html``}
  </div>`;
}
