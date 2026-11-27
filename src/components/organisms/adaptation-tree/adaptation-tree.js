/**
 * Adaptation tree organism — a project's timelines, nested: a long-form
 * edit with its vertical and square variants under it. Each row opens the
 * editor and offers "add a variant", edit, status and delete.
 * State: `#utils/projects/projectPage.js`.
 * @module components/organisms/adaptation-tree
 */

import { html, define } from 'hybrids';
import { openEditAdaptation, openNewAdaptation } from '#utils/projects/adaptationActions.js';
import { removeAdaptation, setAdaptationStatus } from '#utils/projects/adaptationActions.js';
import { projectPageState } from '#utils/projects/projectPage.js';
import { adaptationRows } from '#utils/projects/tree.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';
import '#molecules/adaptation-row/index.js';

/**
 * @typedef {Object} AdaptationTreeHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 */

/**
 * @param {AdaptationTreeHost} _host
 * @param {CustomEvent} event - `adaptationaction` from a row
 */
function handleAction(_host, event) {
  const { action, adaptation, value } = event.detail;
  if (action === 'variant') openNewAdaptation(adaptation.id);
  else if (action === 'edit') openEditAdaptation(adaptation.id);
  else if (action === 'delete') removeAdaptation(adaptation);
  else if (action === 'status') setAdaptationStatus(adaptation, value);
}

/** Open the form for a new top-level adaptation. */
function handleNew() {
  openNewAdaptation();
}

/** @type {import('hybrids').Component<AdaptationTreeHost>} */
export default define({
  tag: 'adaptation-tree',
  state: watch(projectPageState),
  render: {
    value: ({ state }) => {
      const adaptations = state.project?.adaptations || [];
      return html`
        <section class="app-card" aria-labelledby="adaptation-tree-title">
          <header class="app-card-header">
            <h2 class="app-card-title" id="adaptation-tree-title">
              <app-icon name="layers" size="sm"></app-icon> Adaptations
            </h2>
            <button type="button" class="btn btn-secondary" onclick="${handleNew}">
              <app-icon name="plus" size="sm"></app-icon> New adaptation
            </button>
          </header>
          <p class="app-muted adaptation-tree-intro">
            Each adaptation is its own timeline over the same media. Add a variant to cut a vertical
            or square version of an edit.
          </p>
          <ul class="adaptation-tree-list" onadaptationaction="${handleAction}">
            ${adaptationRows(adaptations).map((row) =>
              html`<li>
                <adaptation-row
                  adaptation="${row.adaptation}"
                  depth="${row.depth}"
                  parentName="${row.parentName}"
                  sole="${adaptations.length <= 1}"
                ></adaptation-row>
              </li>`.key(row.adaptation.id),
            )}
          </ul>
        </section>
      `;
    },
    shadow: false,
  },
});
