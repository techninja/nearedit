/**
 * Inspector group "Crop": how much of a picture's source is cut away on
 * each side, with a reset and a keyframe button per pair of sides. Closed
 * until it is needed. Changes leave as bubbling `field-change` events.
 * @module components/molecules/inspector-crop
 */

import { define, html } from 'hybrids';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { fieldOf } from '#utils/inspector/fieldTemplates.js';
import { fieldPair } from '#utils/inspector/groupTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

/**
 * @typedef {Object} InspectorCropHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 */

const SIDES = ['Top', 'Bottom', 'Left', 'Right'].map((side) => `transform.crop${side}`);

/** @type {import('hybrids').Component<InspectorCropHost>} */
export default define({
  tag: 'inspector-crop',
  model: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ model }) => {
      if (model.show?.transform !== 'full') return html``;
      const cropped = SIDES.some((path) => {
        const field = fieldOf(model, path);
        return field.mixed || field.value > 0;
      });
      const animated = model.refs.some((ref) =>
        SIDES.some((path) => ref.clip.keyframes?.[path]?.length),
      );
      const pair = (/** @type {number} */ first, /** @type {string} */ label) => {
        const [a, b] = [SIDES[first], SIDES[first + 1]];
        const letters = label.split(' / ').map((word) => word[0].toUpperCase());
        return keyed(
          model,
          [a, b],
          `Crop ${label}`,
          html`<div class="field-row">
            <span class="field-label">${label}</span>
            ${fieldPair(model, [a, letters[0]], [b, letters[1]])}
          </div>`,
        );
      };
      return html`
        <details class="inspector-section" open="${cropped || animated}">
          <summary class="field-group-title">
            <span>Crop</span>
            <button
              type="button"
              class="icon-btn"
              data-name="reset.crop"
              title="Reset crop"
              aria-label="Reset crop"
              disabled="${model.locked}"
              onclick="${handleButton}"
            >
              <app-icon name="undo" size="sm"></app-icon>
            </button>
          </summary>
          ${pair(0, 'Top / bottom')} ${pair(2, 'Left / right')}
        </details>
      `;
    },
    shadow: false,
  },
});
