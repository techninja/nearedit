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
 * Move focus into a dialog. An element marked `data-autofocus` decides
 * where: itself when it can take focus, else the first control inside it
 * (a list that is still loading keeps focus on the dialog until it has
 * rows). Without a mark, the first control of the body — not the close
 * button in the title bar — gets it.
 * @param {HTMLElement} root
 */
export function focusInto(root) {
  const marked = /** @type {HTMLElement|null} */ (root.querySelector('[data-autofocus]'));
  let target;
  if (marked) target = marked.matches(FOCUSABLE) ? marked : focusables(marked)[0];
  else {
    const body = root.querySelector('.dialog-body');
    target = (body && focusables(body)[0]) || focusables(root)[0];
  }
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

/**
 * Put focus back inside `root` when it fell out of the page because the
 * focused element was re-rendered away (a pressed list row replaced by a
 * new list). Focus that sits on a real control is left alone.
 * @param {HTMLElement} root
 * @param {string} selector - What to focus, relative to `root`
 */
export function refocusIfLost(root, selector) {
  const active = root.ownerDocument.activeElement;
  const lost = !active || active === root.ownerDocument.body || active.tagName === 'APP-DIALOG';
  if (lost) /** @type {HTMLElement|null} */ (root.querySelector(selector))?.focus();
}
