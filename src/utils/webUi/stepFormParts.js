/**
 * Templates of the step form (`<web-step-form>`): one control per field,
 * chosen by the type the step-kind table gives the parameter.
 * @module utils/webUi/stepFormParts
 */

import { html } from 'hybrids';
import * as on from './stepFormEvents.js';

/** @typedef {import('./stepForm.js').FormField} FormField */
/** @typedef {import('./stepFormEvents.js').StepFormHost} StepFormHost */

/** What a `key` box takes, as its tooltip. */
const KEYS_HINT = 'A key by name: Enter, Tab, Escape, Backspace, ArrowDown, a, 7…';
const TIMING = ['duration', 'hold'];

/**
 * A box: one line, or several for a script.
 * @param {FormField} field
 * @param {StepFormHost} host
 */
function box(field, { draft, locked }) {
  const { name, spec, placeholder } = field;
  const typing = draft.name === name;
  const common = {
    value: typing ? draft.text : field.value,
    invalid: field.problem ? 'true' : 'false',
  };
  if (spec.type === 'code')
    return html`<textarea
      class="field-input web-step-form-code"
      rows="3"
      spellcheck="false"
      data-name="${name}"
      aria-label="${field.label}"
      aria-invalid="${common.invalid}"
      placeholder="${placeholder}"
      value="${common.value}"
      disabled="${locked}"
      oninput="${on.handleInput}"
      onchange="${on.handleChange}"
      onkeydown="${on.handleKeys}"
    ></textarea>`;
  return html`<input
    class="${{ 'field-input': true, 'field-num': spec.type === 'number' }}"
    type="text"
    inputmode="${spec.type === 'number' ? 'decimal' : 'text'}"
    autocomplete="off"
    spellcheck="false"
    data-name="${name}"
    title="${spec.type === 'key' ? KEYS_HINT : ''}"
    aria-label="${field.label}"
    aria-invalid="${common.invalid}"
    placeholder="${placeholder}"
    value="${common.value}"
    disabled="${locked}"
    oninput="${on.handleInput}"
    onchange="${on.handleChange}"
    onkeydown="${on.handleKeys}"
  />`;
}

/**
 * @param {FormField} field
 * @param {StepFormHost} host
 */
function control(field, host) {
  const { name, spec, value } = field;
  const { locked, picking } = host;
  if (spec.type === 'boolean')
    return html`<input
      type="checkbox"
      data-name="${name}"
      checked="${value === true}"
      disabled="${locked}"
      onchange="${on.handleToggle}"
    />`;
  if (spec.type === 'select' && spec.multiple)
    return html`<span class="web-step-form-many">
      ${(spec.options || []).map(
        (option) =>
          html`<label class="switch">
            <input
              type="checkbox"
              data-name="${name}"
              value="${option}"
              checked="${Array.isArray(value) && value.includes(option)}"
              disabled="${locked}"
              onchange="${on.handleMany}"
            />
            ${option}
          </label>`,
      )}
    </span>`;
  if (spec.type === 'select')
    return html`<select
      class="field-input"
      data-name="${name}"
      aria-label="${field.label}"
      disabled="${locked}"
      onchange="${on.handleChoice}"
    >
      ${(spec.options || []).map(
        (option) =>
          html`<option value="${option}" selected="${option === value}">
            ${option}${option === spec.default ? ' (default)' : ''}
          </option>`,
      )}
    </select>`;
  if (spec.type !== 'target') return box(field, host);
  return html`<span class="web-step-form-target">
    ${box(field, host)}
    <button
      type="button"
      class="icon-btn"
      data-name="${name}"
      aria-pressed="${picking === name ? 'true' : 'false'}"
      title="Pick it on the page view"
      disabled="${locked}"
      onclick="${on.handlePick}"
    >
      <app-icon name="crosshair" size="sm"></app-icon> Pick
    </button>
  </span>`;
}

/**
 * One field of the form: its label, its control, and what is wrong with it.
 * @param {FormField} field
 * @param {StepFormHost} host
 */
export function fieldRow(field, host) {
  const unit = TIMING.includes(field.name) ? ' (s)' : '';
  return html`<div class="web-step-form-field" data-field="${field.name}">
    <label class="field-row">
      <span class="field-label" title="${field.label}"
        >${field.label}${unit}${field.spec.required ? ' *' : ''}</span
      >
      ${control(field, host)}
    </label>
    ${field.problem && html`<p class="error-message" role="alert">${field.problem}</p>`}
  </div>`.key(field.name);
}
