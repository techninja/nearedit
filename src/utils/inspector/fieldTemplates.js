/**
 * Template helpers shared by the inspector's group components: one line to
 * place a value box, a text box or a colour field bound to a field of the
 * inspector model. The elements report through `field-change` events (see
 * fieldEvents.js); nothing here touches the document.
 * @module utils/inspector/fieldTemplates
 */

import { html } from 'hybrids';
import { handleCommitInput, handleLiveInput, handleTextKeys } from './fieldEvents.js';
import { FIELD_NAMES, specFor } from './specs.js';

/** @typedef {import('./model.js').InspectorModel} InspectorModel */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

const NO_FIELD = { value: undefined, mixed: false, count: 0 };

/**
 * @param {InspectorModel} model
 * @param {string} name
 * @returns {import('./model.js').FieldState}
 */
export const fieldOf = (model, name) => model.fields?.[name] || NO_FIELD;

/**
 * A value box for a numeric field of the model.
 * @param {InspectorModel} model
 * @param {string} name - Field path
 * @param {string} label
 * @param {{ compact?: boolean, slider?: boolean, disabled?: boolean, value?: number,
 *   mixed?: boolean, spec?: import('./fieldValue.js').FieldSpec }} [opts] - `value`
 *   and `mixed` override what the model says (timing fields, uniform scale)
 * @returns {Template}
 */
export function numberField(model, name, label, opts = {}) {
  const field = fieldOf(model, name);
  return html`<field-number
    class="${opts.compact ? 'field-number-compact' : ''}"
    name="${name}"
    label="${label}"
    caption="${FIELD_NAMES[name] || label}"
    value="${opts.value ?? field.value ?? 0}"
    mixed="${opts.mixed ?? field.mixed}"
    slider="${!!opts.slider}"
    disabled="${!!model.locked || !!opts.disabled}"
    spec="${opts.spec || specFor(name)}"
  ></field-number>`;
}

/**
 * A colour field for a colour of the model.
 * @param {InspectorModel} model
 * @param {string} name
 * @param {string} label
 * @param {{ optional?: boolean, fallback?: string }} [opts]
 * @returns {Template}
 */
export function colorField(model, name, label, opts = {}) {
  const field = fieldOf(model, name);
  return html`<field-color
    name="${name}"
    label="${label}"
    value="${field.value || ''}"
    mixed="${field.mixed}"
    optional="${!!opts.optional}"
    fallback="${opts.fallback || '#000000'}"
    disabled="${!!model.locked}"
  ></field-color>`;
}

/**
 * A one-line text box, or with `rows` a text area. Typing is live; the
 * edit becomes one undo step when the box is left.
 * @param {InspectorModel} model
 * @param {string} name
 * @param {string} label
 * @param {{ rows?: number, placeholder?: string }} [opts]
 * @returns {Template}
 */
export function textField(model, name, label, opts = {}) {
  const field = fieldOf(model, name);
  const value = field.mixed ? '' : (field.value ?? '');
  const placeholder = field.mixed ? 'Mixed' : opts.placeholder || '';
  const box = opts.rows
    ? html`<textarea
        class="field-input"
        rows="${opts.rows}"
        data-name="${name}"
        aria-label="${label}"
        placeholder="${placeholder}"
        value="${value}"
        disabled="${!!model.locked}"
        oninput="${handleLiveInput}"
        onchange="${handleCommitInput}"
        onkeydown="${handleTextKeys}"
      ></textarea>`
    : html`<input
        class="field-input"
        type="text"
        data-name="${name}"
        aria-label="${label}"
        placeholder="${placeholder}"
        value="${value}"
        disabled="${!!model.locked}"
        oninput="${handleLiveInput}"
        onchange="${handleCommitInput}"
        onkeydown="${handleTextKeys}"
      />`;
  return html`<label class="field-row"><span class="field-label">${label}</span>${box}</label>`;
}

/**
 * A dropdown for an enumerated field.
 * @param {InspectorModel} model
 * @param {string} name
 * @param {string} label
 * @param {[string, string][]} options - `[value, label]` pairs
 * @returns {Template}
 */
export function selectField(model, name, label, options) {
  const field = fieldOf(model, name);
  return html`<label class="field-row">
    <span class="field-label">${label}</span>
    <select
      class="field-input"
      data-name="${name}"
      aria-label="${label}"
      disabled="${!!model.locked}"
      onchange="${handleCommitInput}"
    >
      ${field.mixed && html`<option value="" selected disabled>Mixed</option>`}
      ${options.map(
        ([value, text]) =>
          html`<option value="${value}" selected="${!field.mixed && value === field.value}">
            ${text}
          </option>`,
      )}
    </select>
  </label>`;
}
