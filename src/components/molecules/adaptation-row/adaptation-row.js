/**
 * Adaptation row molecule — one timeline in the adaptation tree: its name
 * (a link into the editor), shape, size and frame rate, with status,
 * "add a variant", edit and delete. Announces `adaptationaction` with
 * `detail: { action: 'variant'|'edit'|'delete'|'status', adaptation, value }`.
 * @module components/molecules/adaptation-row
 */

import { html, define, dispatch } from 'hybrids';
import { ADAPTATION_STATUSES } from '#utils/projects/adaptationPresets.js';
import { editorUrl } from '#utils/ui/routes.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} AdaptationRowHost
 * @property {import('#utils/projects/api.js').Adaptation} adaptation
 * @property {number} depth - Nesting level, 0 for a top-level adaptation
 * @property {string} parentName - Name of the adaptation it is a variant of
 * @property {boolean} sole - The project's only adaptation: it cannot be deleted
 *   (not called `only`: hybrids reads attributes starting with `on` as event listeners)
 */

/**
 * @param {AdaptationRowHost & HTMLElement} host
 * @param {Event} event
 */
function handleAction(host, event) {
  const control = /** @type {HTMLButtonElement|HTMLSelectElement} */ (event.currentTarget);
  const detail = {
    action: control.dataset.action,
    adaptation: host.adaptation,
    value: control.value,
  };
  dispatch(host, 'adaptationaction', { detail, bubbles: true });
}

/**
 * @param {string} action
 * @param {string} icon
 * @param {string} label - Accessible name
 * @param {string} hint - Tooltip
 * @param {boolean} [disabled]
 * @returns {import('hybrids').UpdateFunctionWithMethods<AdaptationRowHost>}
 */
function iconButton(action, icon, label, hint, disabled = false) {
  return html`
    <button
      type="button"
      class="icon-btn"
      data-action="${action}"
      aria-label="${label}"
      title="${hint}"
      disabled="${disabled}"
      onclick="${handleAction}"
    >
      <app-icon name="${icon}" size="sm"></app-icon>
    </button>
  `;
}

/** @type {import('hybrids').Component<AdaptationRowHost>} */
export default define({
  tag: 'adaptation-row',
  adaptation: {
    value: /** @type {any} */ ({
      id: '',
      projectId: '',
      name: '',
      aspectRatio: '',
      resolution: '',
    }),
  },
  depth: 0,
  parentName: '',
  sole: false,
  render: {
    value: ({ adaptation, depth, parentName, sole }) => {
      const url = editorUrl(adaptation.projectId, adaptation.id);
      const { name } = adaptation;
      return html`
        <div class="adaptation-row" style="${{ '--depth': depth }}">
          <div class="adaptation-row-what">
            ${depth
              ? html`<app-icon class="adaptation-row-branch" name="branch" size="sm"></app-icon>`
              : html``}
            <a class="adaptation-row-name" href="${url}">${name}</a>
            ${parentName ? html`<span class="sr-only">, variant of ${parentName}</span>` : html``}
            <span class="chip adaptation-row-aspect">${adaptation.aspectRatio}</span>
            <span class="adaptation-row-meta">
              ${String(adaptation.resolution).replace('x', '×')} · ${adaptation.fps} fps
            </span>
          </div>
          <div class="adaptation-row-actions">
            <select
              class="field-input adaptation-row-status"
              data-action="status"
              aria-label="${`Status of ${name}`}"
              onchange="${handleAction}"
            >
              ${ADAPTATION_STATUSES.map(
                (status) =>
                  html`<option
                    value="${status.value}"
                    selected="${status.value === (adaptation.status || 'draft')}"
                  >
                    ${status.label}
                  </option>`,
              )}
            </select>
            ${iconButton(
              'variant',
              'branch',
              `Add a variant of ${name}`,
              'Add a variant — for example a vertical cut of this edit',
            )}
            ${iconButton('edit', 'edit', `Edit ${name}`, 'Rename, or change shape and frame rate')}
            ${iconButton(
              'delete',
              'trash',
              `Delete ${name}`,
              sole ? 'A project needs at least one adaptation' : 'Delete',
              sole,
            )}
            <a class="btn btn-primary adaptation-row-open" href="${url}">Open</a>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});
