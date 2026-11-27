/**
 * Inspector group "Transform": how a picture (or title) sits in the frame —
 * fit, position, scale with an aspect lock, rotation, opacity and crop,
 * each section with its own reset. Changes leave as bubbling
 * `field-change` events; uniform scale is the field `transform.scale`.
 * @module components/molecules/inspector-transform
 */

import { define, html } from 'hybrids';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { fieldPair, groupHeading } from '#utils/inspector/groupTemplates.js';
import { fieldOf, numberField } from '#utils/inspector/fieldTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';

/**
 * @typedef {Object} InspectorTransformHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {boolean} unlocked - Scale X and Y are edited separately
 */

/** @param {InspectorTransformHost & HTMLElement} host */
function handleLock(host) {
  host.unlocked = !host.unlocked;
}

const LOCKED_ICON = html`<app-icon name="lock" size="sm"></app-icon>`;
const UNLOCKED_ICON = html`<app-icon name="unlock" size="sm"></app-icon>`;

/** @type {import('hybrids').Component<InspectorTransformHost>} */
export default define({
  tag: 'inspector-transform',
  model: { value: /** @type {any} */ ({}) },
  unlocked: false,
  render: {
    value: ({ model, unlocked }) => {
      if (!model.show?.transform) return html``;
      const full = model.show.transform === 'full';
      const fit = fieldOf(model, 'transform.fit');
      const sx = fieldOf(model, 'transform.scaleX');
      const sy = fieldOf(model, 'transform.scaleY');
      const split = unlocked || Math.abs((sx.value ?? 1) - (sy.value ?? 1)) > 1e-9;
      const pair = (/** @type {string} */ a, /** @type {string} */ b, la = 'X', lb = 'Y') =>
        fieldPair(model, [a, la], [b, lb]);
      return html`
        ${groupHeading('Transform', 'reset.transform', model.locked)}
        ${full &&
        html`<div class="field-row">
          <span class="field-label">Fit</span>
          <span class="seg" role="group" aria-label="Fit">
            ${['cover', 'contain'].map(
              (mode) =>
                html`<button
                  type="button"
                  data-name="transform.fit"
                  data-value="${mode}"
                  aria-pressed="${!fit.mixed && fit.value === mode ? 'true' : 'false'}"
                  title="${mode === 'cover'
                    ? 'Fill the frame, cropping what does not fit'
                    : 'Show the whole picture, with bars'}"
                  disabled="${model.locked}"
                  onclick="${handleButton}"
                >
                  ${mode === 'cover' ? 'Fill' : 'Fit'}
                </button>`,
            )}
          </span>
        </div>`}
        <div class="field-row">
          <span class="field-label">Position</span>${pair('transform.x', 'transform.y')}
        </div>
        <div class="field-row">
          <span class="field-label inspector-transform-scale">
            Scale
            <button
              type="button"
              class="icon-btn"
              aria-pressed="${split ? 'false' : 'true'}"
              title="${split
                ? 'Width and height scale separately'
                : 'Width and height scale together'}"
              aria-label="Lock aspect ratio"
              onclick="${handleLock}"
            >
              ${split ? UNLOCKED_ICON : LOCKED_ICON}
            </button>
          </span>
          ${split
            ? pair('transform.scaleX', 'transform.scaleY', 'W', 'H')
            : numberField(model, 'transform.scale', '', {
                compact: true,
                value: sx.value,
                mixed: sx.mixed,
              })}
        </div>
        ${numberField(model, 'transform.rotation', 'Rotation')}
        ${numberField(model, 'transform.opacity', 'Opacity', { slider: true })}
        ${full &&
        html`${groupHeading('Crop', 'reset.crop', model.locked)}
          <div class="field-row">
            <span class="field-label">Top / bottom</span>${pair(
              'transform.cropTop',
              'transform.cropBottom',
              'T',
              'B',
            )}
          </div>
          <div class="field-row">
            <span class="field-label">Left / right</span>${pair(
              'transform.cropLeft',
              'transform.cropRight',
              'L',
              'R',
            )}
          </div>`}
      `;
    },
    shadow: false,
  },
});
