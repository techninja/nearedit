/**
 * Image field — picks one of the project's stills for a parameter that
 * takes an image (a particle sprite, a mask), showing a small preview of
 * the choice. Reports the chosen path as a bubbling `field-change` event
 * with `{ name, value, phase: 'commit' }`; an empty value means "none".
 * @module components/atoms/field-image
 */

import { define, dispatch, html } from 'hybrids';
import { mediaFileUrl } from '#utils/playback/mediaUrl.js';

/**
 * @typedef {Object} FieldImageHost
 * @property {string} name - Field path reported in the event
 * @property {string} label
 * @property {string} value - Absolute path of the image, '' for none
 * @property {{ path: string, name: string }[]} images - The stills to choose from
 * @property {boolean} disabled
 */

/**
 * @param {string} path
 * @returns {string} File name of a path
 */
const baseName = (path) => path.split(/[\\/]/).pop();

/** @param {FieldImageHost & HTMLElement} host @param {Event} event */
function handleChange(host, event) {
  event.stopPropagation();
  const { value } = /** @type {HTMLSelectElement} */ (event.target);
  dispatch(host, 'field-change', {
    detail: { name: host.name, value, phase: 'commit' },
    bubbles: true,
  });
}

/** @type {import('hybrids').Component<FieldImageHost>} */
export default define({
  tag: 'field-image',
  name: { value: '', reflect: true },
  label: '',
  value: '',
  images: { value: [] },
  disabled: false,
  render: {
    value: ({ label, value, images, disabled }) => {
      const known = images.some((image) => image.path === value);
      return html`
        <span class="field-image-label" title="${label}">${label}</span>
        <span class="field-image-box">
          ${value
            ? html`<img class="field-image-thumb" src="${mediaFileUrl(value)}" alt="" />`
            : html`<span class="field-image-thumb field-image-none"></span>`}
          <select
            class="field-input"
            aria-label="${label}"
            disabled="${disabled}"
            onchange="${handleChange}"
          >
            <option value="" selected="${!value}">None</option>
            ${value && !known
              ? html`<option value="${value}" selected>${baseName(value)}</option>`
              : html``}
            ${images.map(
              (image) =>
                html`<option value="${image.path}" selected="${image.path === value}">
                  ${image.name}
                </option>`,
            )}
          </select>
        </span>
        ${images.length
          ? html``
          : html`<span class="field-image-hint">No stills in this project's media yet</span>`}
      `;
    },
    shadow: false,
  },
});
