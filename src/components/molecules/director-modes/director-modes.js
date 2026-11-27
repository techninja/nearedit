/**
 * Director modes molecule — where the action applies: the whole timeline,
 * the end, the cursor, a range… as radio buttons with a line that says
 * exactly where. Announces `fieldchange` with `detail: { key: 'mode', value }`.
 * @module components/molecules/director-modes
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {Object} DirectorModesHost
 * @property {import('#utils/directorUi/modes.js').ModeChoice[]} choices
 * @property {string} mode - Selected mode id
 * @property {string} group - Radio group name; set it when two pickers are on the page
 * @property {string} problem - What the server objected to
 */

/** @param {DirectorModesHost & HTMLElement} host @param {Event} event */
function handleChange(host, event) {
  event.stopPropagation(); // the native change event is replaced by ours
  const { value } = /** @type {HTMLInputElement} */ (event.target);
  dispatch(host, 'fieldchange', { detail: { key: 'mode', value }, bubbles: true });
}

/** @type {import('hybrids').Component<DirectorModesHost>} */
export default define({
  tag: 'director-modes',
  choices: { value: [] },
  mode: '',
  group: 'director-mode',
  problem: '',
  render: {
    value: ({ choices, mode, group, problem }) => html`
      <fieldset class="director-modes" onchange="${handleChange}">
        <legend>Where</legend>
        ${choices.map(
          (choice) => html`
            <label class="director-modes-choice ${choice.available ? '' : 'director-modes-off'}">
              <input
                type="radio"
                name="${group}"
                value="${choice.id}"
                checked="${choice.id === mode}"
                disabled="${!choice.available}"
              />
              <span>
                <span class="director-modes-label">${choice.label}</span>
                ${choice.id === mode || !choice.available
                  ? html`<span class="director-modes-hint">${choice.hint}</span>`
                  : html``}
              </span>
            </label>
          `,
        )}
        ${problem ? html`<span class="error-message" role="alert">${problem}</span>` : html``}
      </fieldset>
    `,
    shadow: false,
  },
});
