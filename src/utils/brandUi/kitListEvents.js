/**
 * Behaviour of the kit list (`<brand-kit-list>`): a card asks to be
 * chosen, a library kit's button asks for it to be removed, and the card
 * under the pointer (or with the keyboard) plays its picture.
 * @module utils/brandUi/kitListEvents
 */

import { dispatch } from 'hybrids';

/**
 * The project's own kit: `kit` is it, complete, while it is at hand (for
 * its picture).
 * @typedef {{ name: string, colors: Record<string, string>,
 *   kit: import('#utils/brand/types.js').Kit|null }} OwnKit
 */

/**
 * @typedef {Object} BrandKitListHost
 * @property {import('#utils/brandUi/kitApi.js').KitEntry[]} kits
 * @property {string} current - The kit in use: an id of the list, or `project`
 * @property {OwnKit|null} own - The project's own kit, when it has one: shown first
 * @property {{ resolution?: string, fps?: number }} like - The open document's shape
 * @property {boolean} busy - A choice is on its way: the cards wait
 * @property {string} hovered - The card whose picture plays
 * @property {{ byKit: Record<string, any> }} pictures
 */

/** @typedef {BrandKitListHost & HTMLElement} Host */

/** @type {(event: Event) => DOMStringMap} */
const dataOf = (event) => /** @type {HTMLElement} */ (event.currentTarget).dataset;

/** @param {Host} host @param {Event} event */
export function handleChoose(host, event) {
  dispatch(host, 'kit-choose', { detail: { id: dataOf(event).id }, bubbles: true });
}

/** @param {Host} host @param {Event} event */
export function handleRemove(host, event) {
  const { id, name } = dataOf(event);
  dispatch(host, 'kit-remove', { detail: { id, name }, bubbles: true });
}

/** @param {Host} host @param {Event} event */
export function handleHover(host, event) {
  host.hovered = dataOf(event).id;
}

/** @param {Host} host */
export function handleLeave(host) {
  host.hovered = '';
}
