/**
 * Shape picker molecule — the aspect-ratio presets of an adaptation as a
 * row of buttons, each with a little picture of the frame. Announces
 * `fieldchange` with `detail: { key: 'aspectRatio', value }`.
 * @module components/molecules/adaptation-shapes
 */

import { html, define, dispatch } from 'hybrids';
import { ASPECT_PRESETS } from '#utils/projects/adaptationPresets.js';

/**
 * @typedef {Object} AdaptationShapesHost
 * @property {string} value - Selected aspect ratio, e.g. "16:9"
 */

/**
 * @param {AdaptationShapesHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  const { value } = /** @type {HTMLButtonElement} */ (event.currentTarget);
  dispatch(host, 'fieldchange', { detail: { key: 'aspectRatio', value }, bubbles: true });
}

/** @type {import('hybrids').Component<AdaptationShapesHost>} */
export default define({
  tag: 'adaptation-shapes',
  value: '16:9',
  render: {
    value: ({ value }) => html`
      <fieldset class="adaptation-shapes">
        <legend>Shape</legend>
        ${ASPECT_PRESETS.map(
          (preset) => html`
            <button
              type="button"
              class="adaptation-shapes-option"
              value="${preset.aspectRatio}"
              aria-pressed="${preset.aspectRatio === value ? 'true' : 'false'}"
              title="${preset.hint}"
              onclick="${handleClick}"
            >
              <span class="adaptation-shapes-frame">
                <span style="${{ aspectRatio: preset.aspectRatio.replace(':', ' / ') }}"></span>
              </span>
              <strong>${preset.aspectRatio}</strong>
              <span>${preset.label}</span>
            </button>
          `,
        )}
      </fieldset>
    `,
    shadow: false,
  },
});
