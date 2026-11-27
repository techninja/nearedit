/**
 * Tab strip molecule — a row of tabs with roving focus and arrow keys.
 * It only draws the tabs and announces a choice (`tabchange`, with
 * `detail.id`); the owner decides what each tab shows.
 * @module components/molecules/app-tabs
 */

import { html, define, dispatch } from 'hybrids';
import { arrowFocus } from '#utils/ui/focus.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {{ id: string, label: string, icon?: string }} TabItem
 * @typedef {Object} AppTabsHost
 * @property {TabItem[]} tabs
 * @property {string} active - Id of the selected tab ('' for none)
 * @property {string} label - Accessible name of the tab list
 * @property {string} panelPrefix - `aria-controls` becomes this prefix + the tab id
 * @property {'strip'|'bar'} variant - `bar` is the phone-style bottom bar: icon over label
 */

/**
 * @param {AppTabsHost & HTMLElement} host
 * @param {string} id
 */
function choose(host, id) {
  dispatch(host, 'tabchange', { detail: { id }, bubbles: true });
}

/**
 * @param {AppTabsHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  choose(host, /** @type {HTMLElement} */ (event.currentTarget).dataset.tab);
}

/**
 * Arrow keys move along the strip and select as they go.
 * @param {AppTabsHost & HTMLElement} host
 * @param {KeyboardEvent} event
 */
function handleKeydown(host, event) {
  const items = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('[role="tab"]')]);
  const focused = arrowFocus(items, event, { horizontal: true });
  if (focused) choose(host, focused.dataset.tab);
}

/** @type {import('hybrids').Component<AppTabsHost>} */
export default define({
  tag: 'app-tabs',
  tabs: { value: [] },
  active: '',
  label: '',
  panelPrefix: '',
  variant: { value: 'strip', reflect: true },
  render: {
    value: ({ tabs, active, label, panelPrefix }) => html`
      <div class="tabs" role="tablist" aria-label="${label}" onkeydown="${handleKeydown}">
        ${tabs.map(
          (tab, index) => html`
            <button
              type="button"
              class="tab"
              role="tab"
              data-tab="${tab.id}"
              aria-selected="${tab.id === active ? 'true' : 'false'}"
              aria-controls="${panelPrefix ? panelPrefix + tab.id : false}"
              tabindex="${tab.id === active || (!active && index === 0) ? 0 : -1}"
              onclick="${handleClick}"
            >
              ${tab.icon ? html`<app-icon name="${tab.icon}" size="sm"></app-icon>` : html``}
              <span class="app-tabs-label">${tab.label}</span>
            </button>
          `,
        )}
      </div>
    `,
    shadow: false,
  },
});
