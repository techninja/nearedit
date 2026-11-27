/**
 * Behaviour of the keyframe button atom (`<keyframe-control>`): every
 * press leaves it as a bubbling `keyframe-action` event naming the paths
 * the button drives; the menu opens under the button and is worked with
 * the pointer or the arrow keys.
 * @module utils/keyframes/controlEvents
 */

import { dispatch } from 'hybrids';
import { placeMenu } from '#utils/inspector/popup.js';
import { arrowFocus } from '#utils/ui/focus.js';

/**
 * @typedef {'toggle'|'previous'|'next'|'ease'|'stop'} KeyframeActionName
 * @typedef {{ paths: string[], action: KeyframeActionName, ease?: string }} KeyframeActionDetail
 */

/**
 * @typedef {Object} KeyframeControlHost
 * @property {string[]} paths - Property paths the button drives
 * @property {string} label - What it animates, for tooltips
 * @property {'none'|'key'|'between'} state
 * @property {boolean} previous - There is a key before the playhead
 * @property {boolean} next - There is a key after the playhead
 * @property {string} ease - Easing of the current key, '' when none or mixed
 * @property {boolean} current - There is a current key (its easing can be set)
 * @property {boolean} disabled
 * @property {boolean} open - The menu is showing
 * @property {{ left: number, top: number, maxHeight: number }} place
 */

/** @typedef {KeyframeControlHost & HTMLElement} Host */

/** Expected size of the menu, for placing it before it exists. */
const MENU_SIZE = { width: 208, height: 420 };

/**
 * @param {Host} host
 * @param {KeyframeActionName} action
 * @param {string} [ease]
 */
function emit(host, action, ease) {
  /** @type {KeyframeActionDetail} */
  const detail = { paths: host.paths, action, ...(ease && { ease }) };
  dispatch(host, 'keyframe-action', { detail, bubbles: true });
}

/** @param {Host} host */
export function closeMenu(host) {
  if (!host.open) return;
  host.open = false;
  /** @type {HTMLElement|null} */ (host.querySelector('.keyframe-control-more'))?.focus();
}

/** The diamond: add or remove the key under the playhead. @param {Host} host */
export function handleToggle(host) {
  emit(host, 'toggle');
}

/** @param {Host} host @param {Event} event */
export function handleStep(host, event) {
  const { step } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  emit(host, step === 'next' ? 'next' : 'previous');
}

/** Open or close the menu. @param {Host} host @param {Event} event */
export function handleMore(host, event) {
  if (host.open) return closeMenu(host);
  const anchor = /** @type {HTMLElement} */ (event.currentTarget).getBoundingClientRect();
  host.place = placeMenu(anchor, MENU_SIZE, { width: innerWidth, height: innerHeight });
  host.open = true;
}

/** A menu item was chosen. @param {Host} host @param {Event} event */
export function handleItem(host, event) {
  const { action, ease } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  emit(host, /** @type {KeyframeActionName} */ (action), ease);
  // Stepping keeps the menu open, to walk along the keys.
  if (action !== 'previous' && action !== 'next') closeMenu(host);
}

/** Keys inside the menu: arrows move, Escape and Tab close. @param {Host} host @param {KeyboardEvent} event */
export function handleMenuKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault();
    return closeMenu(host);
  }
  const items = /** @type {HTMLElement[]} */ ([
    ...host.querySelectorAll('.menu-item:not(:disabled)'),
  ]);
  arrowFocus(items, event);
}

/** After the menu opened: focus its first usable item. @param {Host} host @param {boolean} open */
export function focusMenu(host, open) {
  if (!open) return;
  requestAnimationFrame(() => {
    const checked = host.querySelector('.menu-item[aria-checked="true"]');
    const first = checked || host.querySelector('.menu-item:not(:disabled)');
    /** @type {HTMLElement|null} */ (first)?.focus();
  });
}
