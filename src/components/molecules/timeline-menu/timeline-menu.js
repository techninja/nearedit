/**
 * Timeline menu — a popup list of actions at a screen position, used for
 * the timeline's context menus and the track "more" menu. The owner sets
 * `open`, `x`, `y` and `items`; the menu runs the chosen item and
 * dispatches `menuclose` so the owner can close it.
 * @module components/molecules/timeline-menu
 */

import { html, define, dispatch } from 'hybrids';
import { placeMenu, stepMenuFocus } from '#utils/timeline/menuDom.js';

/** @typedef {import('#utils/timeline/menuModel.js').MenuItem} MenuItem */

/**
 * @typedef {Object} TimelineMenuHost
 * @property {boolean} open
 * @property {number} x - Client x of the menu's corner
 * @property {number} y - Client y of the menu's corner
 * @property {MenuItem[]} items
 */

/** @type {WeakSet<HTMLElement>} Menus in which a pointer press has begun since they opened */
const armed = new WeakSet();

/** @param {TimelineMenuHost & HTMLElement} host */
function close(host) {
  dispatch(host, 'menuclose', { bubbles: true });
}

/**
 * A press outside the menu closes it. A `contextmenu` event there is only
 * swallowed: after a long-press the browser may send one when the finger
 * lifts, and that must not close the menu the long-press just opened.
 * @param {TimelineMenuHost & HTMLElement} host
 * @param {Event} event
 */
function handleBackdrop(host, event) {
  event.preventDefault();
  if (event.type !== 'contextmenu') close(host);
}

/**
 * A pointer went down inside the menu: its next click counts.
 * @param {TimelineMenuHost & HTMLElement} host
 */
function handleArm(host) {
  armed.add(host);
}

/**
 * Run the chosen item. A pointer click only counts when the press began
 * inside the menu: when a long-press opens the menu under the finger, the
 * browser may turn lifting that finger into a click on whatever item
 * appeared there.
 * @param {TimelineMenuHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handlePick(host, event) {
  if (event.detail > 0 && !armed.has(host)) return;
  const index = Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.index);
  close(host);
  host.items[index]?.run?.();
}

/**
 * Arrow keys walk the items, Escape and Tab close.
 * @param {TimelineMenuHost & HTMLElement} host
 * @param {KeyboardEvent} event
 */
function handleKey(host, event) {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault();
    return close(host);
  }
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (!step) return undefined;
  event.preventDefault();
  stepMenuFocus(/** @type {HTMLElement} */ (event.currentTarget), step);
  return undefined;
}

/**
 * After rendering: keep an open menu inside the window and give it focus.
 * @param {TimelineMenuHost & HTMLElement} host
 */
function place(host) {
  const menu = /** @type {HTMLElement|null} */ (host.querySelector('.timeline-menu'));
  if (menu) placeMenu(menu, host.x, host.y);
  else armed.delete(host);
}

/**
 * @param {MenuItem} item
 * @param {number} index
 */
function renderItem(item, index) {
  if (item.separator) return html`<div class="menu-sep" role="separator"></div>`;
  return html`
    <button
      type="button"
      class="menu-item"
      role="${item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}"
      aria-checked="${item.checked === undefined ? null : String(!!item.checked)}"
      data-index="${index}"
      disabled="${!!item.disabled}"
      onclick="${handlePick}"
    >
      <span class="timeline-menu-check">${item.checked ? '✓' : ''}</span>
      <span>${item.label}</span>
      ${item.shortcut && html`<span class="kbd">${item.shortcut}</span>`}
    </button>
  `;
}

/** @type {import('hybrids').Component<TimelineMenuHost>} */
export default define({
  tag: 'timeline-menu',
  open: false,
  x: 0,
  y: 0,
  items: { value: [] },
  render: {
    value: ({ open, items }) =>
      open
        ? html`
            <div
              class="timeline-menu-backdrop"
              onpointerdown="${handleBackdrop}"
              oncontextmenu="${handleBackdrop}"
            ></div>
            <div
              class="menu timeline-menu"
              role="menu"
              onkeydown="${handleKey}"
              onpointerdown="${handleArm}"
            >
              ${items.map(renderItem)}
            </div>
          `
        : html``,
    shadow: false,
    observe: place,
  },
});
