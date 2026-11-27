/**
 * Adaptation options molecule — size and frame rate, and for a new
 * adaptation which one it is a variant of and whether it starts as a copy
 * of that one's timeline. Announces `fieldchange` with
 * `detail: { key, value }` (keys: resolution, fps, parentId, copy).
 * @module components/molecules/adaptation-options
 */

import { html, define, dispatch } from 'hybrids';
import { FPS_CHOICES, presetFor } from '#utils/projects/adaptationPresets.js';

/**
 * @typedef {Object} AdaptationOptionsHost
 * @property {import('#utils/projects/adaptationForm.js').AdaptationFormValues} values
 * @property {import('#utils/projects/tree.js').TreeRow[]} parents - Possible parents, in tree order
 * @property {boolean} editing - An existing adaptation: its place in the tree is not offered
 */

/**
 * @param {AdaptationOptionsHost & HTMLElement} host
 * @param {Event} event
 */
function handleChange(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const raw = input.type === 'checkbox' ? input.checked : input.value;
  const value = input.name === 'fps' ? Number(raw) : raw;
  dispatch(host, 'fieldchange', { detail: { key: input.name, value }, bubbles: true });
}

/**
 * @param {AdaptationOptionsHost} host
 * @returns {import('hybrids').UpdateFunctionWithMethods<AdaptationOptionsHost>}
 */
function placement({ values, parents }) {
  const parentName = parents.find((row) => row.adaptation.id === values.parentId)?.adaptation.name;
  return html`
    <label class="adaptation-options-field">
      <span>Variant of</span>
      <select class="field-input" name="parentId" onchange="${handleChange}">
        <option value="" selected="${!values.parentId}">Nothing — a new edit of its own</option>
        ${parents.map(
          ({ adaptation, depth }) =>
            html`<option value="${adaptation.id}" selected="${adaptation.id === values.parentId}">
              ${'— '.repeat(depth)}${adaptation.name} (${adaptation.aspectRatio})
            </option>`,
        )}
      </select>
    </label>
    ${values.parentId
      ? html`<label class="switch adaptation-options-copy">
          <input type="checkbox" name="copy" checked="${values.copy}" onchange="${handleChange}" />
          <span>
            Start from a copy of “${parentName}” — same clips and timing, ready to reframe.
            Unticked, the timeline starts empty.
          </span>
        </label>`
      : html``}
  `;
}

/** @type {import('hybrids').Component<AdaptationOptionsHost>} */
export default define({
  tag: 'adaptation-options',
  values: {
    value: {
      name: '',
      aspectRatio: '16:9',
      resolution: '1920x1080',
      fps: 30,
      parentId: '',
      copy: false,
    },
  },
  parents: { value: [] },
  editing: false,
  render: {
    value: (host) => {
      const { values, editing } = host;
      const offered = presetFor(values.aspectRatio)?.sizes || [];
      const sizes = offered.includes(values.resolution) ? offered : [values.resolution, ...offered];
      const rates = FPS_CHOICES.includes(values.fps) ? FPS_CHOICES : [...FPS_CHOICES, values.fps];
      return html`
        <div class="adaptation-options-pair">
          <label class="adaptation-options-field">
            <span>Size</span>
            <select class="field-input" name="resolution" onchange="${handleChange}">
              ${sizes.map(
                (size) =>
                  html`<option value="${size}" selected="${size === values.resolution}">
                    ${size.replace('x', ' × ')}
                  </option>`,
              )}
            </select>
          </label>
          <label class="adaptation-options-field">
            <span>Frame rate</span>
            <select class="field-input" name="fps" onchange="${handleChange}">
              ${rates.map(
                (fps) =>
                  html`<option value="${fps}" selected="${fps === values.fps}">${fps} fps</option>`,
              )}
            </select>
          </label>
        </div>
        ${editing
          ? html`<p class="app-muted">
              The timeline is kept. After a change of shape, check the framing of each clip.
            </p>`
          : placement(host)}
      `;
    },
    shadow: false,
  },
});
