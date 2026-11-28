/**
 * The places of a page: the headings worth stopping at on the way down,
 * where the page should scroll to show one, and the call to action a tour
 * ends on — all read from a snapshot's elements (WEBCLIP.md § Server).
 * Reference: docs/app-spec/DIRECTOR-WEB.md § A tour. Isomorphic and pure.
 * @module utils/director/web/places
 */

/** @typedef {import('./match.js').PageElement} PageElement */
/** @typedef {{ width: number, height: number }} Viewport */

/** Headings closer together than this share of the picture's height are one place. */
const APART = 0.5;
/** A section "starts with" a heading that is at most this share of the height below its top. */
const NEAR_TOP = 0.35;
/** Something at least this share of the height tall is shown from its top. */
const TALL = 0.6;
/** Where a heading without a section is put: this share of the height below the top. */
const HEADROOM = 0.2;

const STRONG =
  /^(get started|start (your |a |my )?free|start for free|start now|try (it )?(for )?free|try (it )?now|sign up|create (an |your |my )?account|join( now| free| us| the (beta|waitlist))?$|book a demo|request a demo|get a demo|buy now|subscribe|install|download|get the app|get (early )?access|add to cart)/i;
const WEAK = /\b(start|try|sign up|join|buy|demo|subscribe|download|install|order)\b/i;

/**
 * The named section a heading opens, if any.
 * @param {PageElement} heading
 * @param {PageElement[]} elements
 * @param {Viewport} viewport
 * @returns {PageElement|undefined} The innermost section holding the heading near its top
 */
export function sectionOf(heading, elements, viewport) {
  const { x, y, width, height } = heading.rect;
  const [cx, cy] = [x + width / 2, y + height / 2];
  return elements
    .filter((el) => el.kind === 'section')
    .filter(({ rect }) => cx >= rect.x && cx <= rect.x + rect.width)
    .filter(({ rect }) => cy >= rect.y && cy <= rect.y + rect.height)
    .filter(({ rect }) => y - rect.y <= NEAR_TOP * viewport.height)
    .sort((a, b) => a.rect.height - b.rect.height)[0];
}

/**
 * The headings a tour stops at, top to bottom: the first of every stretch
 * of headings, so the cards of a grid do not each count.
 * @param {PageElement[]} elements
 * @param {Viewport} viewport
 * @returns {PageElement[]}
 */
export function pagePlaces(elements, viewport) {
  const headings = elements
    .filter((el) => el.kind === 'heading' && el.name)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  /** @type {PageElement[]} */
  const places = [];
  for (const heading of headings) {
    const last = places[places.length - 1];
    if (!last || heading.rect.y - last.rect.y >= APART * viewport.height) places.push(heading);
  }
  return places;
}

/**
 * How a `scroll` step shows an element: something tall from its top, a
 * heading through the section it opens (or a fifth of the way down the
 * picture, clear of a sticky menu), anything small in the middle.
 * @param {PageElement} element
 * @param {PageElement[]} elements
 * @param {Viewport} viewport
 * @returns {{ to: string|number, align: 'start'|'center' }}
 */
export function scrollFor(element, elements, viewport) {
  const tall = (/** @type {PageElement} */ el) => el.rect.height >= TALL * viewport.height;
  if (tall(element)) return { to: element.target, align: 'start' };
  if (element.kind !== 'heading') return { to: element.target, align: 'center' };
  const section = sectionOf(element, elements, viewport);
  if (section && tall(section)) return { to: section.target, align: 'start' };
  return {
    to: Math.max(0, Math.round(element.rect.y - HEADROOM * viewport.height)),
    align: 'start',
  };
}

/**
 * The page's main call to action: the link or button that most reads like
 * one, a button-sized one before a text link, the lowest on the page among
 * equals — which is where a tour ends up.
 * @param {PageElement[]} elements
 * @returns {PageElement|null}
 */
export function callToAction(elements) {
  /** @type {PageElement|null} */
  let best = null;
  let top = 1;
  for (const element of elements) {
    if (element.kind !== 'link' && element.kind !== 'button') continue;
    const reads = STRONG.test(element.name.trim()) ? 3 : WEAK.test(element.name) ? 1 : 0;
    const score = reads && reads + (element.rect.height >= 36 ? 1 : 0);
    const lower = best && element.rect.y > best.rect.y;
    if (score > top || (score === top && score > 1 && lower)) [best, top] = [element, score];
  }
  return best;
}

/**
 * The stops of a tour: down the page from place to place, ending on the
 * call to action.
 * @param {PageElement[]} elements
 * @param {Viewport} viewport
 * @param {number} [most] - Most places to stop at; all of them by default
 * @returns {{ stops: { do: string, on: string }[], places: number, left: number }}
 *   `places`: how many the page has below its opening view; `left`: how
 *   many of them the tour passes by
 */
export function tourStops(elements, viewport, most = Infinity) {
  const below = pagePlaces(elements, viewport).filter(
    (place) => place.rect.y >= APART * viewport.height,
  );
  const count = Math.max(0, Math.min(below.length, Math.floor(most)));
  // Fewer stops than places: keep them spread over the whole page, the last one included.
  const chosen = Array.from({ length: count }, (_, i) =>
    count === 1
      ? below[below.length - 1]
      : below[Math.round((i * (below.length - 1)) / (count - 1))],
  );
  const stops = chosen.map((place) => ({ do: 'scroll', on: place.name }));
  const action = callToAction(elements);
  if (action) stops.push({ do: 'hover', on: action.name }, { do: 'focus', on: action.name });
  else if (!stops.length) stops.push({ do: 'scroll', on: 'bottom' });
  return { stops, places: below.length, left: below.length - count };
}
