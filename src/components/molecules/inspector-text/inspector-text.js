/**
 * Inspector group "Title": the words (multi-line) and how they look — font,
 * size, colour, background box, alignment, bold and italic, outline.
 * Changes leave as bubbling `field-change` events.
 * @module components/molecules/inspector-text
 */

import { define, html } from 'hybrids';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { groupHeading } from '#utils/inspector/groupTemplates.js';
import {
  colorField,
  fieldOf,
  numberField,
  selectField,
  textField,
} from '#utils/inspector/fieldTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} InspectorTextHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** @type {[string, string][]} */
const FONTS = [
  ['sans-serif', 'Sans-serif'],
  ['serif', 'Serif'],
  ['monospace', 'Monospace'],
];

/**
 * A pressed/unpressed style button.
 * @param {import('#utils/inspector/model.js').InspectorModel} model
 * @param {string} name - Field path
 * @param {string|boolean} value - What pressing it sets
 * @param {string} icon
 * @param {string} label
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTextHost>}
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

/** @type {import('hybrids').Component<InspectorTextHost>} */
export default define({
  tag: 'inspector-text',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.show?.text) return html``;
      return html`
        ${groupHeading('Title', 'reset.text', model.locked, 'Reset the style (the words stay)')}
        ${textField(model, 'text.content', 'Text', { rows: 3, placeholder: 'Title text' })}
        ${selectField(model, 'text.fontFamily', 'Font', FONTS)}
        ${numberField(model, 'text.fontSize', 'Size')}
        <div class="field-row">
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
        </div>
        ${colorField(model, 'text.color', 'Colour', { fallback: '#ffffff' })}
        ${colorField(model, 'text.background', 'Background', { optional: true })}
        ${colorField(model, 'text.outlineColor', 'Outline')}
        ${numberField(model, 'text.outlineWidth', 'Outline width')}
      `;
    },
    shadow: false,
  },
});
