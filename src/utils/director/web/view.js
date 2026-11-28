/**
 * Keeping what the camera goes close to in the middle of the picture. A
 * zoom can only centre something that is well inside the page's view — at
 * the edge, the picture's own edge is in the way. So the demo follows, as
 * far as a snapshot can tell, where the page is scrolled to, and scrolls a
 * target to the middle before a step the camera zooms in on.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Zoom. Isomorphic and pure.
 * @module utils/director/web/view
 */

import { stepKind } from '#utils/web/stepKinds.js';

/** @typedef {import('./match.js').PageElement} PageElement */
/**
 * @typedef {Object} Sight - Where the page is scrolled to
 * @property {number} y - Page pixels above the view
 * @property {boolean} known - False when a step moved the page in a way a snapshot cannot tell
 */

/** The part of the view's height a zoomed target must be in: its middle half. */
const COMFORT = [0.25, 0.75];
/** A scroll shorter than this many pixels is not worth making. */
const WORTH = 8;
/** What a centring scroll takes, seconds: quicker than a scroll one is meant to watch. */
const MOVE = Object.freeze({ duration: 0.7, hold: 0.1 });

/**
 * @param {string} verb - A step kind
 * @param {boolean} clicks - Whether the camera zooms on clicks and typing
 * @returns {boolean} True for a step the camera zooms in on
 */
export function zoomedOn(verb, clicks) {
  const camera = stepKind(verb)?.camera;
  return camera === 'always' || (camera === 'clicks' && clicks);
}

/** @returns {Sight} A page that has just loaded */
export const topOfPage = () => ({ y: 0, known: true });

/**
 * @param {number} y
 * @param {{ viewport: { height: number }, height: number }} page - `height`: of the whole page
 * @returns {number} A scroll position the page can be at
 */
const within = (y, page) =>
  Math.max(0, Math.min(Math.max(0, page.height - page.viewport.height), y));

/**
 * Where the page is after a step.
 * @param {Sight} sight
 * @param {Record<string, any>} step - A recipe step
 * @param {PageElement|null} element - What it aims at, when that is known
 * @param {{ viewport: { height: number }, height: number }} page
 * @returns {Sight}
 */
export function sightAfter(sight, step, element, page) {
  const view = page.viewport.height;
  if (step.do === 'goto') return topOfPage();
  if (step.do === 'scroll') {
    if (step.to === 'top') return topOfPage();
    if (step.to === 'bottom') return { y: within(Infinity, page), known: true };
    if (typeof step.to === 'number') return { y: within(step.to, page), known: true };
    if (step.by) return { ...sight, y: within(sight.y + step.by, page) };
    if (!element) return { ...sight, known: false };
    const { y, height } = element.rect;
    return { y: within(step.align === 'start' ? y : y + height / 2 - view / 2, page), known: true };
  }
  const aims = typeof step.target === 'string' && step.target !== '';
  if (aims && !element) return { ...sight, known: false };
  let next = sight;
  if (element) {
    const { y, height } = element.rect;
    const inView = sight.known && y >= sight.y && y + height <= sight.y + view;
    if (!inView) next = { y: within(y + height / 2 - view / 2, page), known: true };
  }
  // A link may jump to another part of the page, a key may do anything.
  const jumps = step.do === 'press' || (step.do === 'click' && element?.kind !== 'button');
  return jumps ? { ...next, known: false } : next;
}

/**
 * The scroll that brings a target to the middle before the camera goes
 * close to it — when the step is one the camera zooms in on and the target
 * is not already well inside the view.
 * @param {Sight} sight
 * @param {Record<string, any>} step - The step about to be played
 * @param {PageElement|null} element - Its target
 * @param {{ viewport: { height: number }, height: number }} page
 * @param {boolean} clicks - Whether the camera zooms on clicks and typing
 * @param {boolean} [ahead] - The camera goes close to this same target right
 *   after the step: centre it now, before the pointer settles on it
 * @returns {Record<string, any>|null} A `scroll` step, or null when none is needed
 */
export function centring(sight, step, element, page, clicks, ahead = false) {
  if (!element || !(ahead || zoomedOn(step.do, clicks))) return null;
  const view = page.viewport.height;
  const { y, height } = element.rect;
  if (height > view) return null;
  const middle = (y + height / 2 - sight.y) / view;
  if (sight.known && middle >= COMFORT[0] && middle <= COMFORT[1]) return null;
  // Out of view, the step itself brings its target to the middle (WEBCLIP.md § Steps).
  if (sight.known && (y < sight.y || y + height > sight.y + view)) return null;
  const goal = within(y + height / 2 - view / 2, page);
  if (sight.known && Math.abs(goal - sight.y) < WORTH) return null;
  return { do: 'scroll', to: element.target, align: 'center', ...MOVE, note: step.note || '' };
}
