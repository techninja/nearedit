/**
 * The input controls of the director form, one per field type of an
 * action schema: a slider with its value, a select (or a text box with
 * suggestions when free text is allowed), a file choice, a text box.
 * Template functions for `<director-form>`; every control is named after
 * its field key.
 * @module utils/directorUi/fieldControls
 */

import { html } from 'hybrids';
import { rangeText } from '#utils/directorUi/form.js';

/** @typedef {import('#utils/director/fields.js').ActionField} ActionField */

/** @param {ActionField} field @param {any} value @returns {any} */
function rangeControl(field, value) {
  return html`
    <span class="director-form-range">
      <input
        class="field-range"
        type="range"
        name="${field.key}"
        min="${field.min}"
        max="${field.max}"
        step="${field.step}"
        value="${value}"
        aria-label="${field.label}"
      />
      <output>${rangeText(field, value)}</output>
    </span>
  `;
}

/** @param {ActionField} field @param {any} value @returns {any} */
function selectControl(field, value) {
  // Free text with suggestions: a text box, and the suggestions as chips
  // that fill it in (`<datalist>` cannot be bound: `input.list` is read-only).
  if (field.allowCustom)
    return html`
      <input class="field-input" name="${field.key}" value="${value}" autocomplete="off" />
      <span class="director-form-ideas">
        ${field.options.map(
          (option) =>
            html`<button
              type="button"
              class="chip"
              data-field="${field.key}"
              data-value="${option.value}"
              aria-pressed="${option.value === value ? 'true' : 'false'}"
            >
              ${option.label}
            </button>`,
        )}
      </span>
    `;
  return html`
    <select class="field-input" name="${field.key}">
      ${field.options.map(
        (option) =>
          html`<option value="${option.value}" selected="${option.value === String(value)}">
            ${option.label}
          </option>`,
      )}
    </select>
  `;
}

/**
 * The control of one field (toggles are laid out by the form itself).
 * @param {ActionField} field
 * @param {any} value
 * @param {{ filePath: string, relativePath: string }[]} files - Choices of a `file` field
 * @returns {any}
 */
export function fieldControl(field, value, files) {
  if (field.type === 'range') return rangeControl(field, value);
  if (field.type === 'select') return selectControl(field, value);
  if (field.type === 'file')
    return html`
      <select class="field-input" name="${field.key}">
        <option value="" selected="${!value}">None</option>
        ${files.map(
          (file) =>
            html`<option value="${file.filePath}" selected="${file.filePath === value}">
              ${file.relativePath}
            </option>`,
        )}
      </select>
    `;
  return html`<input
    class="field-input"
    name="${field.key}"
    value="${value}"
    placeholder="${field.placeholder || ''}"
    autocomplete="off"
  />`;
}
