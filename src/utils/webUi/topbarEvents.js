/**
 * Behaviour of the web editor's top bar (`<web-topbar>`): the address box
 * takes effect when it is left with something that is an address, the
 * dropdowns at once.
 * @module utils/webUi/topbarEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';
import { readAddress } from './address.js';

/**
 * @typedef {{ recipe: import('#utils/web/types.js').Recipe, problem: string } & HTMLElement} Host
 */

/** The address box was left or Enter pressed: use it when it is an address. @param {Host} host @param {Event} event */
export function handleAddress(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const { url, problem } = readAddress(input.value);
  host.problem = problem;
  if (url) emitChange(host, 'url', url);
  // Show what is stored: the typed text when it was refused, the address otherwise.
  if (url) input.value = url;
}

/** @param {Host} host @param {KeyboardEvent} event */
export function handleAddressKeys(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (event.key === 'Enter') input.blur();
  if (event.key !== 'Escape' || input.value === host.recipe.url) return;
  event.stopPropagation();
  input.value = host.recipe.url;
  host.problem = '';
}

/** @param {Host} host @param {Event} event */
export function handleChoice(host, event) {
  const control = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  const number = control.dataset.type === 'number';
  if (number && !Number.isFinite(Number(control.value))) return;
  emitChange(host, control.dataset.name, number ? Number(control.value) : control.value);
}

/** @param {Host} host */
export function handleRefresh(host) {
  dispatch(host, 'web-refresh', { bubbles: true });
}
