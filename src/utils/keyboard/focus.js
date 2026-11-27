/**
 * Deciding when a keystroke belongs to the focused control and not to the
 * editor's shortcuts: typing in a field, activating a button with Space,
 * moving a slider with the arrows, working a menu or a dialog. Duck-typed
 * on the event target so it can be tested without a DOM.
 * @module utils/keyboard/focus
 */

/** Input types that take text: every key is theirs. */
const NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'];

/**
 * @param {any} target - `event.target`
 * @param {string} combo - Canonical combo of the keystroke
 * @returns {boolean} True when the editor must leave this keystroke alone
 */
export function controlOwnsKey(target, combo) {
  if (!target || typeof target.tagName !== 'string') return false;
  if (target.isContentEditable) return true;
  if (target.closest?.('[role="menu"], [role="dialog"], dialog')) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const activates = combo === 'Space' || combo === 'Enter';
  if (tag === 'INPUT') {
    const type = String(target.type || 'text').toLowerCase();
    if (type === 'range') return /^(Arrow|Home|End|Page)/.test(combo);
    if (!NON_TEXT_INPUTS.includes(type)) return true;
    return activates || (type === 'radio' && combo.startsWith('Arrow'));
  }
  const buttonLike =
    tag === 'BUTTON' ||
    tag === 'SUMMARY' ||
    (tag === 'A' && !!target.hasAttribute?.('href')) ||
    target.getAttribute?.('role') === 'button';
  return buttonLike && activates;
}

/**
 * A modal dialog is open somewhere on the page: the editor's shortcuts are
 * off until it closes, wherever the focus happens to be (Delete must not
 * remove clips behind an export dialog).
 * @returns {boolean}
 */
export function modalIsOpen() {
  const page = /** @type {any} */ (globalThis).document;
  return !!page?.querySelector?.('.dialog-backdrop, dialog[open], [aria-modal="true"]');
}

/**
 * Copy and cut stay with the browser while text is selected on the page
 * (a transcript, a log line), so that text can still be copied.
 * @param {string} combo
 * @param {boolean} mac
 * @returns {boolean}
 */
export function browserOwnsClipboardKey(combo, mac) {
  const mod = mac ? 'Meta' : 'Ctrl';
  if (combo !== `${mod}+C` && combo !== `${mod}+X`) return false;
  const selected = globalThis.getSelection?.();
  return !!selected && !selected.isCollapsed && selected.toString().length > 0;
}

/**
 * Call from the click handler of a button that sits near the timeline: a
 * mouse or touch click gives the focus back to the page, so that Space
 * plays instead of pressing the button again. A keyboard "click" (Enter or
 * Space on the focused button) keeps the focus where the user put it.
 * @param {{ detail?: number, currentTarget?: any }} event - The click event
 */
export function releasePointerFocus(event) {
  if (event.detail > 0) event.currentTarget?.blur?.();
}

/** @returns {boolean} True on Apple platforms, where `Mod` is the Command key */
export function isMacPlatform() {
  const nav = /** @type {any} */ (globalThis.navigator);
  const platform = nav?.userAgentData?.platform || nav?.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}
