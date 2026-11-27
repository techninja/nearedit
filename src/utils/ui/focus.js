/**
 * Keyboard focus helpers for dialogs and menus: find what can take focus,
 * keep Tab inside a container, move focus in on open.
 * @module utils/ui/focus
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The elements inside `root` a person can Tab to, in document order.
 * Hidden elements (display none, `hidden`, inside a closed dialog) are left out.
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
export function focusables(root) {
  const found = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)]);
  return found.filter((el) => el.getClientRects().length > 0);
}

/**
 * Keep Tab and Shift+Tab inside `root`, wrapping at both ends.
 * @param {HTMLElement} root
 * @param {KeyboardEvent} event - A keydown event
 * @returns {boolean} true when the event was a Tab that had to be redirected
 */
export function trapTab(root, event) {
  if (event.key !== 'Tab') return false;
  const items = focusables(root);
  if (!items.length) {
    event.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = /** @type {HTMLElement} */ (root.ownerDocument.activeElement);
  const outside = !root.contains(active) || active === root;
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * Move focus into a container: the element marked `data-autofocus`, else
 * the first field or button, else the container itself.
 * @param {HTMLElement} root
 */
export function focusInto(root) {
  const marked = /** @type {HTMLElement|null} */ (root.querySelector('[data-autofocus]'));
  const target = marked && marked.getClientRects().length ? marked : focusables(root)[0];
  (target || root).focus({ preventScroll: true });
}

/**
 * Move focus between sibling items with the arrow keys (lists, tab strips).
 * @param {HTMLElement[]} items
 * @param {KeyboardEvent} event
 * @param {{ horizontal?: boolean }} [opts]
 * @returns {HTMLElement|null} The item that received focus, or null when the key was not for us
 */
export function arrowFocus(items, event, opts = {}) {
  const [prev, next] = opts.horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  const moves = { [prev]: -1, [next]: 1, Home: -Infinity, End: Infinity };
  if (!(event.key in moves) || !items.length) return null;
  const current = items.indexOf(/** @type {HTMLElement} */ (event.target));
  const wanted = current + moves[event.key];
  const index = Number.isFinite(wanted)
    ? (wanted + items.length) % items.length
    : wanted < 0
      ? 0
      : items.length - 1;
  event.preventDefault();
  items[index].focus();
  return items[index];
}
