/**
 * Inspector group "Transform": how a picture, title or generator sits in
 * the frame — fit, position, scale with an aspect lock, rotation, opacity
 * and blend mode. Position, scale, rotation and opacity each have a
 * keyframe button. Changes leave as bubbling `field-change` events;
 * uniform scale is the field `transform.scale`.
 * @module components/molecules/inspector-transform
 */

import { define, html } from 'hybrids';
import { BLEND_MODES } from '#utils/compose/blend.js';
import { handleButton } from '#utils/inspector/fieldEvents.js';
import { fieldPair, groupHeading } from '#utils/inspector/groupTemplates.js';
import { fieldOf, numberField, selectField } from '#utils/inspector/fieldTemplates.js';
import { keyed } from '#utils/inspector/keyTemplates.js';
import '#atoms/app-icon/app-icon.js';
import '#atoms/field-number/field-number.js';
import '#atoms/keyframe-control/keyframe-control.js';

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
/** @type {[string, string][]} */
const BLENDS = BLEND_MODES.map((mode) => [mode.id, mode.label]);

/** @type {import('hybrids').Component<InspectorTransformHost>} */
export default define({
  tag: 'inspector-transform',
  model: { value: /** @type {any} */ ({}) },
  unlocked: false,
  render: {
    value: ({ model, unlocked }) => {
      if (!model.show?.transform) return html``;
      const fit = fieldOf(model, 'transform.fit');
      const sx = fieldOf(model, 'transform.scaleX');
      const sy = fieldOf(model, 'transform.scaleY');
      const split = unlocked || Math.abs((sx.value ?? 1) - (sy.value ?? 1)) > 1e-9;
      const fitButton = (/** @type {string} */ mode) =>
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
        </button>`;
      const scale = html`<div class="field-row">
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
          ? fieldPair(model, ['transform.scaleX', 'W'], ['transform.scaleY', 'H'])
          : numberField(model, 'transform.scale', '', {
              compact: true,
              value: sx.value,
              mixed: sx.mixed,
            })}
      </div>`;
      return html`
        ${groupHeading('Transform', 'reset.transform', model.locked)}
        ${model.show.transform === 'full'
          ? keyed(
              model,
              [],
              'Fit',
              html`<div class="field-row">
                <span class="field-label">Fit</span>
                <span class="seg" role="group" aria-label="Fit">
                  ${fitButton('cover')}${fitButton('contain')}
                </span>
              </div>`,
            )
          : html``}
        ${keyed(
          model,
          ['transform.x', 'transform.y'],
          'Position',
          html`<div class="field-row">
            <span class="field-label">Position</span>
            ${fieldPair(model, ['transform.x', 'X'], ['transform.y', 'Y'])}
          </div>`,
        )}
        ${keyed(model, ['transform.scaleX', 'transform.scaleY'], 'Scale', scale)}
        ${keyed(
          model,
          ['transform.rotation'],
          'Rotation',
          numberField(model, 'transform.rotation', 'Rotation'),
        )}
        ${keyed(
          model,
          ['transform.opacity'],
          'Opacity',
          numberField(model, 'transform.opacity', 'Opacity', { slider: true }),
        )}
        ${keyed(model, [], 'Blend', selectField(model, 'blendMode', 'Blend', BLENDS))}
      `;
    },
    shadow: false,
  },
});
