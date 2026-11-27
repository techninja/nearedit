/**
 * DOM helpers for a popup menu: keep it inside the window, and move the
 * keyboard focus between its items.
 * @module utils/timeline/menuDom
 */

const MARGIN = 4;

/**
 * @param {HTMLElement} menu
 * @returns {HTMLElement[]} The items that can be chosen
 */
function enabledItems(menu) {
  return /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('button:not(:disabled)')]);
}

/**
 * Put a fixed-position menu at a point, pulled back inside the window when
 * it would stick out, and focus its first item unless the focus is already
 * inside.
 * @param {HTMLElement} menu
 * @param {number} x - Client x wanted for the menu's corner
 * @param {number} y - Client y wanted for the menu's corner
 */
export function placeMenu(menu, x, y) {
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN))}px`;
  menu.style.top = `${Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN))}px`;
  if (!menu.contains(document.activeElement)) enabledItems(menu)[0]?.focus();
}

/**
 * Move the focus to the next or previous item, wrapping around.
 * @param {HTMLElement} menu
 * @param {1|-1} step
 */
export function stepMenuFocus(menu, step) {
  const items = enabledItems(menu);
  const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  items[(at + step + items.length) % items.length]?.focus();
}
