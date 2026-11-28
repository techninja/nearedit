/**
 * Behaviour of the Brand section of the Create tab (`<brand-create>`): its
 * tiles (press adds, hover or focus plays the thumbnail, drag carries the
 * element to the timeline), the button that opens the Brand dialog and the
 * one that brings out-of-date clips up to date.
 * @module utils/brandUi/createEvents
 */

import { dispatch } from 'hybrids';
import { CREATE_DRAG_TYPE, beginDrag } from '#utils/create/dragTypes.js';
import { openBrandDialog } from './dialogState.js';
import { elementsWord, updateToBrand } from './stale.js';

/**
 * @typedef {Object} BrandCreateHost
 * @property {import('./kitState.js').KitState} kit - The project's kit
 * @property {any} doc - The open document
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline
 * @property {string} hovered - Id of the element whose thumbnail plays
 * @property {string} said - What the last update did
 */

/** @typedef {BrandCreateHost & HTMLElement} Host */

/** @type {(event: Event) => DOMStringMap} */
const dataOf = (event) => /** @type {HTMLElement} */ (event.currentTarget).dataset;

/** A tile was pressed: ask for its element to be added. @param {Host} host @param {Event} event */
export function handleAdd(host, event) {
  dispatch(host, 'brand-add', { detail: { element: dataOf(event).element }, bubbles: true });
}

/** @param {Host} host @param {Event} event */
export function handleHover(host, event) {
  host.hovered = dataOf(event).element;
}

/** @param {Host} host */
export function handleLeave(host) {
  host.hovered = '';
}

/** @param {Host} _host @param {DragEvent} event */
export function handleDragStart(_host, event) {
  const { element, label } = dataOf(event);
  beginDrag(event, CREATE_DRAG_TYPE, { kind: 'element', element, label });
}

/** "Brand…": choose a kit or shape it. */
export function handleOpen() {
  openBrandDialog();
}

/** "Update N elements": bring every out-of-date clip up to date. @param {Host} host */
export function handleUpdate(host) {
  const changed = updateToBrand();
  host.said = changed ? `Updated ${elementsWord(changed)} to the brand` : '';
}
