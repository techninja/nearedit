/**
 * Behaviour shared by the page map (`<web-page-map>`) and the element
 * list (`<web-element-list>`): a press on an element's outline, on a row
 * of the list or on empty page becomes a bubbling `web-pick` event —
 * `detail: { pick, x, y }`, the pick and where on screen a menu for it
 * belongs.
 * @module utils/webUi/pageEvents
 */

import { dispatch } from 'hybrids';
import { mapLayout } from './pageMap.js';

/**
 * @typedef {Object} PageHost
 * @property {import('./pageMap.js').Snapshot|null} snapshot
 */

/** @typedef {PageHost & HTMLElement} Host */

/**
 * @param {Host} host
 * @param {import('./pageMap.js').PageElement|null} element
 * @param {{ x: number, y: number }} point - Page pixels
 * @param {{ x: number, y: number }} screen - Client pixels
 */
function announce(host, element, point, screen) {
  const pick = { element, point };
  dispatch(host, 'web-pick', { detail: { pick, ...screen }, bubbles: true });
}

/**
 * The page point under a pointer event on the map.
 * @param {Element} area - The map
 * @param {import('./pageMap.js').Snapshot} snapshot
 * @param {MouseEvent} event
 * @returns {{ x: number, y: number }} Page pixels
 */
function pagePoint(area, snapshot, event) {
  const box = area.getBoundingClientRect();
  const { width, height } = mapLayout(snapshot);
  return {
    x: ((event.clientX - box.left) / box.width) * width,
    y: ((event.clientY - box.top) / box.height) * height,
  };
}

/**
 * An element's outline, or its row in the list, was pressed.
 * @param {Host} host
 * @param {MouseEvent} event
 */
export function handleElement(host, event) {
  event.stopPropagation();
  const button = /** @type {HTMLElement} */ (event.currentTarget);
  const element = host.snapshot?.elements[Number(button.dataset.index)];
  if (!element) return;
  const area = host.querySelector('.web-page-map-area');
  const { rect } = element;
  // A key press and a row of the list have no place on the page: the
  // point is the element's middle, and the menu opens at what was pressed.
  if (!area || event.detail === 0) {
    const box = button.getBoundingClientRect();
    const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return announce(host, element, middle, { x: box.left, y: box.bottom });
  }
  const screen = { x: event.clientX, y: event.clientY };
  announce(host, element, pagePoint(area, host.snapshot, event), screen);
}

/** Empty page was pressed. @param {Host} host @param {MouseEvent} event */
export function handleMap(host, event) {
  const area = /** @type {Element} */ (event.currentTarget);
  if (!host.snapshot) return;
  const screen = { x: event.clientX, y: event.clientY };
  announce(host, null, pagePoint(area, host.snapshot, event), screen);
}

/**
 * When another page arrives, bring the picture to the top of the view.
 * @param {Host} host
 * @param {import('./pageMap.js').Snapshot|null} snapshot
 */
export function showPicture(host, snapshot) {
  if (!snapshot) return;
  requestAnimationFrame(() => {
    const area = /** @type {HTMLElement|null} */ (host.querySelector('.web-page-map-area'));
    if (!area) return;
    const { view, height } = mapLayout(snapshot);
    host.scrollTop = (view.y / height) * area.offsetHeight;
  });
}
