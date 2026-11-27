/**
 * Inspector groups for the finer points of a title: "Spacing and box"
 * (line height, letter spacing, wrap width, the background box with its
 * padding and corner radius) and "Outline and shadow". Each is closed
 * until opened; every number and colour has a keyframe button. Changes
 * leave as bubbling `field-change` events.
 * @module components/molecules/inspector-text-style
 */

import { define, html } from 'hybrids';
import { colorField, fieldOf, numberField } from '#utils/inspector/fieldTemplates.js';
import { fieldPair } from '#utils/inspector/groupTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import '#atoms/field-color/field-color.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/**
 * @typedef {Object} InspectorTextStyleHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

/** @typedef {import('#utils/inspector/model.js').InspectorModel} Model */

/**
 * A keyable number row.
 * @param {Model} model
 * @param {string} name - Field under `text.`
 * @param {string} label
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTextStyleHost>}
 */
const number = (model, name, label) =>
  keyed(model, [`text.${name}`], label, numberField(model, `text.${name}`, label));

/**
 * A keyable colour row. An optional colour that is not set has nothing to
 * animate, so its keyframe button waits until there is a colour.
 * @param {Model} model
 * @param {string} name
 * @param {string} label
 * @param {{ optional?: boolean }} [opts]
 * @returns {import('hybrids').UpdateFunctionWithMethods<InspectorTextStyleHost>}
 */
function color(model, name, label, opts = {}) {
  const path = `text.${name}`;
  const paths = opts.optional && !fieldOf(model, path).value ? [] : [path];
  return keyed(model, paths, label, colorField(model, path, label, opts));
}

/** @type {import('hybrids').Component<InspectorTextStyleHost>} */
export default define({
  tag: 'inspector-text-style',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (!model.show?.text) return html``;
      return html`
        <details class="inspector-section">
          <summary class="field-group-title"><span>Spacing and box</span></summary>
          ${number(model, 'lineHeight', 'Line height')}
          ${number(model, 'letterSpacing', 'Letter spacing')}
          ${number(model, 'maxWidth', 'Wrap width')}
          ${color(model, 'background', 'Box colour', { optional: true })}
          ${number(model, 'boxPadding', 'Box padding')} ${number(model, 'boxRadius', 'Box radius')}
        </details>
        <details class="inspector-section">
          <summary class="field-group-title"><span>Outline and shadow</span></summary>
          ${color(model, 'outlineColor', 'Outline')}
          ${number(model, 'outlineWidth', 'Outline width')} ${color(model, 'shadowColor', 'Shadow')}
          ${number(model, 'shadowBlur', 'Shadow blur')}
          ${keyed(
            model,
            ['text.shadowX', 'text.shadowY'],
            'Shadow offset',
            html`<div class="field-row">
              <span class="field-label">Shadow offset</span>
              ${fieldPair(model, ['text.shadowX', 'X'], ['text.shadowY', 'Y'])}
            </div>`,
          )}
        </details>
      `;
    },
    shadow: false,
  },
});
