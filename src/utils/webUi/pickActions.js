/**
 * What one can do with something picked on the page view: the steps offered
 * for an element, or for a bare point of the page, each as the step it
 * would add. Labels and step kinds come from the step-kind table. Pure and
 * isomorphic.
 * @module utils/webUi/pickActions
 */

import { stepKind } from '#utils/web/index.js';
import { mapLayout, pointTarget } from './pageMap.js';

/** @typedef {import('./pageMap.js').Snapshot} Snapshot */

/**
 * @typedef {Object} Pick - What was pressed on the page view
 * @property {import('./pageMap.js').PageElement|null} element - null for empty page
 * @property {{ x: number, y: number }} point - Where, page pixels
 */

/**
 * @typedef {Object} PickAction
 * @property {string} id
 * @property {string} label
 * @property {Record<string, any>} step - The step it adds
 */

/** What is offered, in menu order: [id, the step kind, label, the field the target goes in]. */
const OFFERS = [
  ['click', 'click', 'Click', 'target'],
  ['hover', 'hover', 'Hover', 'target'],
  ['type', 'type', 'Type into', 'target'],
  ['scroll', 'scroll', 'Scroll to', 'to'],
  ['highlight', 'highlight', 'Highlight', 'target'],
  ['focus', 'focus', 'Zoom in', 'target'],
];

/** How the offers read for a bare point; what is not here is not offered for one. */
const POINT_LABELS = {
  click: 'Click here',
  hover: 'Move the cursor here',
  type: 'Click here and type',
  focus: 'Zoom in here',
};

/**
 * The steps offered for an element.
 * @param {string} target - The element's target
 * @returns {PickAction[]}
 */
export function elementActions(target) {
  return OFFERS.filter(([, kind]) => stepKind(kind)).map(([id, kind, label, field]) => ({
    id,
    label,
    step: { do: kind, [field]: target },
  }));
}

/**
 * The steps offered for a bare point. Inside the picture a point is a
 * target like any other (`point=x,y`, viewport pixels); "Scroll to" brings
 * that height of the page to the middle of the viewport. Above and below
 * the picture a point can only be scrolled to.
 * @param {Snapshot} snapshot
 * @param {{ x: number, y: number }} point - Page pixels
 * @returns {PickAction[]}
 */
export function pointActions(snapshot, point) {
  const { view, height } = mapLayout(snapshot);
  const top = Math.max(0, Math.min(height - view.height, point.y - view.height / 2));
  /** @type {PickAction} */
  const scroll = {
    id: 'scroll',
    label: 'Scroll to here',
    step: { do: 'scroll', to: Math.round(top) },
  };
  const target = pointTarget(snapshot, point);
  if (!target) return [scroll];
  const here = elementActions(target)
    .filter((action) => action.id in POINT_LABELS)
    .map((action) => ({ ...action, label: POINT_LABELS[action.id] }));
  return [...here, scroll];
}

/**
 * A heading for the menu of a pick.
 * @param {Pick} pick
 * @param {Snapshot} snapshot
 * @returns {string} `button · Get started`, or `Point 640, 300`
 */
export function pickTitle(pick, snapshot) {
  if (pick.element) return `${pick.element.kind} · ${pick.element.name}`;
  const { view } = mapLayout(snapshot);
  const inside = pointTarget(snapshot, pick.point);
  const x = Math.round(pick.point.x - view.x);
  const y = Math.round(pick.point.y - view.y);
  return inside ? `Point ${x}, ${y}` : `Page, ${Math.round(pick.point.y)} px down`;
}

/**
 * Everything offered for a pick.
 * @param {Pick} pick
 * @param {Snapshot} snapshot
 * @returns {PickAction[]}
 */
export function pickActions(pick, snapshot) {
  return pick.element ? elementActions(pick.element.target) : pointActions(snapshot, pick.point);
}

/**
 * The target a pick gives a field that is being picked for.
 * @param {Pick} pick
 * @param {Snapshot} snapshot
 * @returns {string} '' when the pick names nothing a target can be
 */
export function pickedTarget(pick, snapshot) {
  return pick.element ? pick.element.target : pointTarget(snapshot, pick.point);
}
