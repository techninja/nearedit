/**
 * Element list of the web editor — everything on the page a step can aim
 * at, by name, sorted under the section each lies in and marked when it
 * is above or below the picture: the way to something far down the page
 * or too small to press on the map. A press sends the same bubbling
 * `web-pick` event the map does.
 * @module components/molecules/web-element-list
 */

import { define, html } from 'hybrids';
import { handleElement } from '#utils/webUi/pageEvents.js';
import { placeOf } from '#utils/webUi/pageMap.js';
import { sectionGroups } from '#utils/webUi/pageSections.js';

/**
 * @typedef {Object} WebElementListHost
 * @property {import('#utils/webUi/pageMap.js').Snapshot|null} snapshot
 * @property {string} query - Words to find in the names
 */

const PLACE = { above: '↑ above', below: '↓ below', view: '' };

/**
 * @param {import('#utils/webUi/pageMap.js').Snapshot} snapshot
 * @param {import('#utils/webUi/pageMap.js').PageElement} element
 * @returns {string} Where it is when it is not in the picture
 */
function whereOf(snapshot, element) {
  const place = placeOf(snapshot, element.rect);
  return place === 'view' && element.visible === false ? 'cut off' : PLACE[place];
}

/** @param {WebElementListHost} host @param {Event} event */
function handleQuery(host, event) {
  host.query = /** @type {HTMLInputElement} */ (event.target).value;
}

/** Typing here is not a shortcut of the dialog. @param {WebElementListHost} _host @param {KeyboardEvent} event */
function handleKeys(_host, event) {
  if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
}

/** @type {import('hybrids').Component<WebElementListHost>} */
export default define({
  tag: 'web-element-list',
  snapshot: { value: /** @type {any} */ (null) },
  query: '',
  render: {
    value: ({ snapshot, query }) => {
      if (!snapshot) return html``;
      const wanted = query.trim().toLowerCase();
      const groups = sectionGroups(snapshot)
        .map((group) => ({
          ...group,
          elements: group.elements.filter((each) => each.name.toLowerCase().includes(wanted)),
        }))
        .filter((group) => group.elements.length || (!wanted && group.index >= 0));
      /** @type {(index: number, name: string, kind: string) => any} */
      const row = (index, name, kind) =>
        html`<button
          type="button"
          class="web-element-list-row"
          data-index="${index}"
          title="${`${kind}: ${name}`}"
          onclick="${handleElement}"
        >
          <span class="chip">${kind}</span>
          <span class="web-element-list-name">${name}</span>
          <small>${whereOf(snapshot, snapshot.elements[index])}</small>
        </button>`;
      return html`
        <input
          class="field-input"
          type="search"
          placeholder="Find on the page"
          aria-label="Find on the page"
          value="${query}"
          oninput="${handleQuery}"
          onkeydown="${handleKeys}"
        />
        <div class="web-element-list-groups" role="group" aria-label="Elements of the page">
          ${groups.map(
            (group) =>
              html`<div class="web-element-list-group">
                ${group.index >= 0
                  ? row(group.index, group.name, 'section')
                  : html`<div class="web-element-list-row">Outside every section</div>`}
                ${group.elements.map((each) => row(each.index, each.name, each.kind))}
              </div>`,
          )}
          ${groups.length
            ? html``
            : html`<p class="app-muted">Nothing on the page is called that.</p>`}
        </div>
      `;
    },
    shadow: false,
  },
});
