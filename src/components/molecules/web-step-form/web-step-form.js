/**
 * Step form of the web editor — the fields of the selected step, generated
 * from the step-kind table: its kind's parameters, then duration, hold,
 * easing and note. A box shows its default as the placeholder and only a
 * value that differs from it; a target can be typed or picked on the page
 * view; what `validateRecipe` finds wrong shows under the field it concerns.
 * Events: `field-change` (`steps.<n>.<field>`) and `web-pick-field`
 * (`#utils/webUi/stepFormEvents.js`).
 * @module components/molecules/web-step-form
 */

import { define, html } from 'hybrids';
import { fieldRow } from '#utils/webUi/stepFormParts.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/webUi/stepFormEvents.js').StepFormHost} StepFormHost */

/** @type {import('hybrids').Component<StepFormHost>} */
export default define({
  tag: 'web-step-form',
  fields: { value: [] },
  index: 0,
  heading: '',
  about: '',
  picking: '',
  locked: false,
  draft: { value: { name: '', text: '' } },
  render: {
    value: (host) => {
      const { fields, index, heading, about } = host;
      const own = fields.filter((field) => !field.common);
      const common = fields.filter((field) => field.common);
      return html`
        <div class="web-step-form-head">
          <strong>Step ${index + 1}: ${heading}</strong>
          <span>${about}</span>
        </div>
        ${own.map((field) => fieldRow(field, host))}
        <div class="field-group-title">Timing and note</div>
        ${common.map((field) => fieldRow(field, host))}
      `;
    },
    shadow: false,
  },
});
