/**
 * Inspector group "Title": the words (multi-line) and their basic look —
 * font family (each shown in its own face), size, weight, alignment, bold
 * and italic, colour. Spacing, the box, outline, shadow and animation are
 * in the groups that follow. Changes leave as bubbling `field-change`
 * events.
 * @module components/molecules/inspector-text
 */

import { define, html } from 'hybrids';
import { resolveFamily } from '#utils/compose/fonts.js';
import { handleButton, handleCommitInput } from '#utils/inspector/fieldEvents.js';
import { groupHeading } from '#utils/inspector/groupTemplates.js';
import { colorField, fieldOf, numberField, textField } from '#utils/inspector/fieldTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-font/field-font.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/**
 * @typedef {Object} InspectorTextHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** @typedef {import('hybrids').UpdateFunctionWithMethods<InspectorTextHost>} Template */

const WEIGHT_NAMES = { 400: 'Regular', 700: 'Bold', 900: 'Black' };

/**
 * A pressed/unpressed style button.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @param {string} name - Field path
 * @param {string|boolean} value - What pressing it sets
 * @param {string} icon
 * @param {string} label
 * @returns {Template}
 */
function styleButton(model, name, value, icon, label) {
  const field = fieldOf(model, name);
  const toggle = typeof value === 'boolean';
  const pressed = !field.mixed && (toggle ? field.value === true : field.value === value);
  return html`<button
    type="button"
    data-name="${name}"
    data-type="${toggle ? 'boolean' : 'string'}"
    data-value="${toggle ? String(!pressed) : value}"
    aria-pressed="${pressed ? 'true' : 'false'}"
    title="${label}"
    aria-label="${label}"
    disabled="${model.locked}"
    onclick="${handleButton}"
  >
    <app-icon name="${icon}" size="sm"></app-icon>
  </button>`;
}

/**
 * The weights the chosen family is bundled in; "auto" follows the bold button.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @returns {Template}
 */
function weightSelect(model) {
  const weight = fieldOf(model, 'text.weight');
  const family = resolveFamily(fieldOf(model, 'text.fontFamily').value);
  const option = (/** @type {number} */ value, /** @type {string} */ text) =>
    html`<option value="${value}" selected="${!weight.mixed && value === weight.value}">
      ${text}
    </option>`;
  return html`<label class="field-row">
    <span class="field-label">Weight</span>
    <select
      class="field-input"
      data-name="text.weight"
      aria-label="Font weight"
      disabled="${model.locked}"
      onchange="${handleCommitInput}"
    >
      ${weight.mixed ? html`<option value="" selected disabled>Mixed</option>` : html``}
      ${option(0, 'Auto (follows bold)')}
      ${family.weights.map((value) => option(value, `${WEIGHT_NAMES[value] || ''} ${value}`))}
    </select>
  </label>`;
}

/** @type {import('hybrids').Component<InspectorTextHost>} */
export default define({
  tag: 'inspector-text',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.show?.text) return html``;
      const font = fieldOf(model, 'text.fontFamily');
      return html`
        ${groupHeading('Title', 'reset.text', model.locked, 'Reset the style (the words stay)')}
        ${textField(model, 'text.content', 'Text', { rows: 3, placeholder: 'Title text' })}
        ${keyed(
          model,
          [],
          'Font',
          html`<field-font
            name="text.fontFamily"
            value="${font.value || ''}"
            mixed="${font.mixed}"
            disabled="${model.locked}"
          ></field-font>`,
        )}
        ${keyed(model, ['text.fontSize'], 'Text size', numberField(model, 'text.fontSize', 'Size'))}
        ${keyed(model, [], 'Weight', weightSelect(model))}
        ${keyed(
          model,
          [],
          'Style',
          html`<div class="field-row">
            <span class="field-label">Style</span>
            <span class="inspector-text-style">
              <span class="seg" role="group" aria-label="Alignment">
                ${styleButton(model, 'text.align', 'left', 'align-left', 'Align left')}
                ${styleButton(model, 'text.align', 'center', 'align-center', 'Align centre')}
                ${styleButton(model, 'text.align', 'right', 'align-right', 'Align right')}
              </span>
              <span class="seg" role="group" aria-label="Weight and slant">
                ${styleButton(model, 'text.bold', true, 'bold', 'Bold')}
                ${styleButton(model, 'text.italic', true, 'italic', 'Italic')}
              </span>
            </span>
          </div>`,
        )}
        ${keyed(
          model,
          ['text.color'],
          'Text colour',
          colorField(model, 'text.color', 'Colour', { fallback: '#ffffff' }),
        )}
      `;
    },
    shadow: false,
  },
});
