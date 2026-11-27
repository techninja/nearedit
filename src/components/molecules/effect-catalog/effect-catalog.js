/**
 * Effect list — every effect of the catalog by category, with a search
 * box; looks (chains of effects) come first when the library has any.
 * Choosing an entry announces it as a bubbling `effect-pick` event whose
 * detail is the effect-stack action to apply (`{ action: 'add', type,
 * params }` or `{ action: 'chain', effects }`) plus its `label`; the owner
 * decides what it is applied to. Used by the Create tab and by the
 * inspector's "Add effect".
 * @module components/molecules/effect-catalog
 */

import { define, dispatch, html } from 'hybrids';
import { groupByCategory, searchItems } from '#utils/create/catalogView.js';
import { categoryIcon } from '#utils/create/categories.js';
import { EFFECT_DRAG_TYPE, beginDrag, endDrag } from '#utils/create/dragTypes.js';
import { actionFor, allEffectItems } from '#utils/create/effectList.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} EffectCatalogHost
 * @property {string} query - What is typed in the search box
 * @property {boolean} disabled - Nothing to apply to: entries cannot be chosen
 * @property {string} hint - Shown above the list, e.g. what it applies to
 * @property {boolean} dragItems - Entries can be dragged (onto a clip of the timeline)
 */

/** @param {EffectCatalogHost & HTMLElement} host @param {Event} event */
function handleSearch(host, event) {
  host.query = /** @type {HTMLInputElement} */ (event.target).value;
}

/** Keys typed in the search box stay there; Escape clears it. @param {EffectCatalogHost} host @param {KeyboardEvent} event */
function handleSearchKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Escape') host.query = '';
}

/**
 * @param {EffectCatalogHost & HTMLElement} host
 * @param {string} key
 * @returns {import('#utils/create/effectList.js').EffectItem|undefined}
 */
const itemOf = (host, key) => allEffectItems().find((item) => item.key === key);

/** @param {EffectCatalogHost & HTMLElement} host @param {Event} event */
function handlePick(host, event) {
  const item = itemOf(host, /** @type {HTMLElement} */ (event.currentTarget).dataset.key);
  if (!item) return;
  const detail = { ...actionFor(item), label: item.label };
  dispatch(host, 'effect-pick', { detail, bubbles: true });
}

/** @param {EffectCatalogHost & HTMLElement} host @param {DragEvent} event */
function handleDragStart(host, event) {
  const item = itemOf(host, /** @type {HTMLElement} */ (event.currentTarget).dataset.key);
  if (item) beginDrag(event, EFFECT_DRAG_TYPE, { ...actionFor(item), label: item.label });
}

/** @type {import('hybrids').Component<EffectCatalogHost>} */
export default define({
  tag: 'effect-catalog',
  query: '',
  disabled: false,
  hint: '',
  dragItems: false,
  render: {
    value: ({ query, disabled, hint, dragItems }) => {
      const groups = groupByCategory(searchItems(allEffectItems(), query));
      return html`
        <div class="effect-catalog-search">
          <app-icon name="search" size="sm"></app-icon>
          <input
            class="field-input"
            type="search"
            placeholder="Search effects"
            aria-label="Search effects"
            value="${query}"
            oninput="${handleSearch}"
            onkeydown="${handleSearchKeys}"
          />
        </div>
        ${hint ? html`<p class="effect-catalog-hint" role="status">${hint}</p>` : html``}
        ${groups.map(
          (group) => html`
            <div class="field-group-title">${group.label}</div>
            <div class="effect-catalog-list" role="group" aria-label="${group.label}">
              ${group.items.map((item) =>
                html`<button
                  type="button"
                  class="effect-catalog-item"
                  data-key="${item.key}"
                  title="${item.description || item.label}"
                  disabled="${disabled}"
                  draggable="${dragItems ? 'true' : 'false'}"
                  onclick="${handlePick}"
                  ondragstart="${handleDragStart}"
                  ondragend="${endDrag}"
                >
                  <app-icon name="${categoryIcon(item.category)}" size="sm"></app-icon>
                  <span class="effect-catalog-name">${item.label}</span>
                  <span class="effect-catalog-about">${item.description}</span>
                </button>`.key(item.key),
              )}
            </div>
          `,
        )}
        ${groups.length
          ? html``
          : html`<div class="empty-state">No effect matches “${query}”.</div>`}
      `;
    },
    shadow: false,
  },
});
