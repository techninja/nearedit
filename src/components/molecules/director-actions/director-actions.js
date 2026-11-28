/**
 * Director actions molecule — the list of things the director can do, one
 * button each. An action that needs the language model while none can be
 * reached is disabled and says why. Announces `actionpick` (`detail.id`).
 * @module components/molecules/director-actions
 */

import { html, define, dispatch } from 'hybrids';
import { actionState } from '#utils/directorUi/availability.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} DirectorActionsHost
 * @property {import('#utils/director/actions.js').ActionSchema[]} actions
 * @property {import('#utils/directorUi/availability.js').LlmStatus|null} llm
 */

const ICONS = {
  base_edit: 'wand',
  generate_edit: 'ai',
  generate_script: 'file-text',
  execute_script: 'list-video',
  insert_broll: 'film',
  motion_piece: 'motion',
  site_demo: 'web',
  score: 'music',
  remove_silence: 'split',
  beat_sync: 'beat',
  add_captions: 'captions',
};

const BADGES = { yes: 'AI', optional: 'AI optional' };

/** @param {DirectorActionsHost & HTMLElement} host @param {MouseEvent} event */
function handlePick(host, event) {
  const { id } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'actionpick', { detail: { id }, bubbles: true });
}

/**
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @param {import('#utils/directorUi/availability.js').LlmStatus|null} llm
 * @returns {import('hybrids').UpdateFunctionWithMethods<DirectorActionsHost>}
 */
function actionTemplate(action, llm) {
  const { enabled, note } = actionState(action, llm);
  return html`
    <li>
      <button
        type="button"
        class="director-actions-item"
        data-id="${action.id}"
        disabled="${!enabled}"
        onclick="${handlePick}"
      >
        <app-icon name="${ICONS[action.id] || 'wand'}" size="md"></app-icon>
        <span class="director-actions-text">
          <span class="director-actions-title">
            <strong>${action.title}</strong>
            ${BADGES[action.llm] ? html`<span class="chip">${BADGES[action.llm]}</span>` : html``}
          </span>
          <span class="director-actions-about">${action.description}</span>
          ${note ? html`<span class="director-actions-note">${note}</span>` : html``}
        </span>
        <app-icon class="director-actions-go" name="chevron" size="sm"></app-icon>
      </button>
    </li>
  `.key(action.id);
}

/** @type {import('hybrids').Component<DirectorActionsHost>} */
export default define({
  tag: 'director-actions',
  actions: { value: [] },
  llm: { value: /** @type {any} */ ({}) },
  render: {
    value: ({ actions, llm }) => html`
      <ul class="director-actions" aria-label="Director actions">
        ${actions.map((action) => actionTemplate(action, 'available' in (llm || {}) ? llm : null))}
      </ul>
    `,
    shadow: false,
  },
});
