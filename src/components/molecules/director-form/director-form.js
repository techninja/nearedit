/**
 * Director form molecule — renders the fields of an action schema
 * (`GET /api/director/actions`): range, select (optionally with free
 * text), toggle, text and file fields. Announces `fieldchange` with
 * `detail: { key, value }`; it holds no values of its own.
 * @module components/molecules/director-form
 */

import { html, define, dispatch } from 'hybrids';
import { fieldBlocked } from '#utils/directorUi/availability.js';
import { fieldControl } from '#utils/directorUi/fieldControls.js';

/**
 * @typedef {import('#utils/director/fields.js').ActionField} ActionField
 * @typedef {Object} DirectorFormHost
 * @property {ActionField[]} fields
 * @property {Record<string, any>} values
 * @property {Record<string, string>} problems - Field key → what the server objected to
 * @property {import('#utils/directorUi/availability.js').LlmStatus|null} llm
 * @property {{ filePath: string, relativePath: string }[]} files - Choices of a `file` field
 */

/** @param {DirectorFormHost & HTMLElement} host @param {Event} event */
function handleInput(host, event) {
  event.stopPropagation(); // replaced by `fieldchange`
  const input = /** @type {HTMLInputElement} */ (event.target);
  const field = host.fields.find((f) => f.key === input.name);
  if (!field) return;
  let value = /** @type {string|number|boolean} */ (input.value);
  if (field.type === 'toggle') value = input.checked;
  else if (field.type === 'range') value = Number(input.value);
  dispatch(host, 'fieldchange', { detail: { key: field.key, value }, bubbles: true });
}

/**
 * A suggestion chip fills in its field.
 * @param {DirectorFormHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  const chip = /** @type {HTMLElement} */ (event.target).closest('[data-field]');
  if (!chip) return;
  const { field: key, value } = /** @type {HTMLElement} */ (chip).dataset;
  dispatch(host, 'fieldchange', { detail: { key, value }, bubbles: true });
}

/** @param {ActionField} field @param {DirectorFormHost} host @returns {any} */
function fieldTemplate(field, host) {
  const value = host.values[field.key] ?? field.default;
  const problem = host.problems[field.key];
  const blocked = fieldBlocked(field.key, host.llm && 'available' in host.llm ? host.llm : null);
  const help = blocked ? 'Needs the language model, which is not available.' : field.help;
  const notes = html`
    ${help ? html`<span class="director-form-help">${help}</span>` : html``}
    ${problem ? html`<span class="error-message" role="alert">${problem}</span>` : html``}
  `;
  if (field.type === 'toggle')
    return html`
      <div class="director-form-field">
        <label class="switch">
          <input
            type="checkbox"
            name="${field.key}"
            checked="${Boolean(value) && !blocked}"
            disabled="${blocked}"
          />
          <span>${field.label}</span>
        </label>
        ${notes}
      </div>
    `.key(field.key);
  return html`
    <label class="director-form-field">
      <span class="director-form-label">${field.label}</span>
      ${fieldControl(field, value, host.files)} ${notes}
    </label>
  `.key(field.key);
}

/** @type {import('hybrids').Component<DirectorFormHost>} */
export default define({
  tag: 'director-form',
  fields: { value: [] },
  values: { value: {} },
  problems: { value: {} },
  llm: { value: /** @type {any} */ ({}) },
  files: { value: [] },
  render: {
    value: (host) => html`
      <div
        class="director-form"
        oninput="${handleInput}"
        onchange="${handleInput}"
        onclick="${handleClick}"
      >
        ${host.fields.map((field) => fieldTemplate(field, host))}
      </div>
    `,
    shadow: false,
  },
});
