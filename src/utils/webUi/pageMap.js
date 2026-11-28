/**
 * The page view of the web editor, as geometry. A snapshot gives a picture
 * of the viewport and, in page pixels, the rectangle of everything on the
 * whole page one can aim at. The view is a map of the whole page: the
 * picture sits where the viewport is, and what lies above or below it is
 * drawn as outlines only — there is no picture of it. Pure and isomorphic.
 * @module utils/webUi/pageMap
 */

import { describeTarget, formatTarget } from '#utils/web/index.js';

/**
 * @typedef {Object} PageElement
 * @property {string} kind - link, button, input, heading, image, section
 * @property {string} name
 * @property {string} target - Finds exactly this element
 * @property {{ x: number, y: number, width: number, height: number }} rect - Page CSS pixels
 * @property {boolean} visible - Inside the viewport when the snapshot was taken
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} url
 * @property {string} title
 * @property {{ width: number, height: number }} viewport
 * @property {{ width: number, height: number }} page
 * @property {number} scrollY
 * @property {string} image - Data URL of the viewport
 * @property {PageElement[]} elements
 * @property {string[]} [warnings]
 */

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

/**
 * @param {Snapshot} snapshot
 * @returns {{ width: number, height: number, view: Rect }} The size of the
 *   map and where the picture sits on it, page pixels
 */
export function mapLayout(snapshot) {
  const { viewport, page, scrollY } = snapshot;
  const view = { x: 0, y: Math.max(0, scrollY), width: viewport.width, height: viewport.height };
  return {
    width: Math.max(page?.width || 0, viewport.width),
    height: Math.max(page?.height || 0, view.y + view.height),
    view,
  };
}

/**
 * A rectangle as CSS percentages of the map.
 * @param {Rect} rect
 * @param {{ width: number, height: number }} map
 * @returns {{ left: string, top: string, width: string, height: string }}
 */
export function percentBox(rect, map) {
  const part = (/** @type {number} */ value, /** @type {number} */ of) =>
    `${Math.round((value / of) * 1e5) / 1e3}%`;
  return {
    left: part(rect.x, map.width),
    top: part(rect.y, map.height),
    width: part(rect.width, map.width),
    height: part(rect.height, map.height),
  };
}

/**
 * The elements in the order they are stacked: large ones first, so that
 * what lies inside a section is on top of it and takes the click.
 * @param {Snapshot} snapshot
 * @returns {(PageElement & { index: number })[]} `index` is the element's
 *   place in the snapshot
 */
export function stackedElements(snapshot) {
  const area = (/** @type {PageElement} */ el) => el.rect.width * el.rect.height;
  return (snapshot.elements || [])
    .map((element, index) => ({ ...element, index }))
    .sort((a, b) => area(b) - area(a) || a.index - b.index);
}

/**
 * A point of the picture as a target: viewport pixels.
 * @param {Snapshot} snapshot
 * @param {{ x: number, y: number }} point - Page pixels
 * @returns {string} `point=x,y`; '' for a point outside the picture
 */
export function pointTarget(snapshot, point) {
  const { view } = mapLayout(snapshot);
  const x = Math.round(point.x - view.x);
  const y = Math.round(point.y - view.y);
  if (x < 0 || y < 0 || x > view.width || y > view.height) return '';
  return formatTarget({ by: 'point', value: `${x},${y}`, x, y });
}

/**
 * What a step's target marks on the map.
 * @param {Snapshot} snapshot
 * @param {any} target - A step's `target` (or a scroll's `to`)
 * @returns {{ index: number, point: { x: number, y: number }|null }} The
 *   element with that target (-1 = none), or for a point target where it
 *   is, in page pixels
 */
export function markOf(snapshot, target) {
  const wanted = typeof target === 'number' ? '' : describeTarget(target);
  if (!wanted) return { index: -1, point: null };
  const at = /^point=(-?[\d.]+),(-?[\d.]+)$/.exec(wanted);
  if (at) {
    const { view } = mapLayout(snapshot);
    return { index: -1, point: { x: Number(at[1]) + view.x, y: Number(at[2]) + view.y } };
  }
  const index = (snapshot.elements || []).findIndex(
    (element) => describeTarget(element.target) === wanted,
  );
  return { index, point: null };
}

/**
 * @param {Snapshot} snapshot
 * @param {Rect} rect - Page pixels
 * @returns {'above'|'view'|'below'} Where it lies against the picture
 */
export function placeOf(snapshot, rect) {
  const { view } = mapLayout(snapshot);
  if (rect.y + rect.height <= view.y) return 'above';
  return rect.y >= view.y + view.height ? 'below' : 'view';
}
