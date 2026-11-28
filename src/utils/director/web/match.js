/**
 * Matching a name to the page. A stop names what it acts on the way a
 * person would say it — "Pricing", "the Email field", "the Pro plan" — and
 * a snapshot lists what is on the page (WEBCLIP.md § Server: kind, name,
 * target). The best element is the one whose name fits best, with the kind
 * the verb implies preferred: fields for typing, links and buttons for
 * clicking, sections and headings for scrolling.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Matching names.
 * Isomorphic and pure.
 * @module utils/director/web/match
 */

import { plain, tokens } from './words.js';

/**
 * @typedef {{ kind: string, name: string, target: string, visible?: boolean,
 *   rect: { x: number, y: number, width: number, height: number } }} PageElement
 * @typedef {Object} Match
 * @property {PageElement} element
 * @property {number} quality - 0..1: how well the name fits, whatever its kind
 * @property {'exact'|'case'|'spelling'|'part'|'words'} how
 */

/** The kinds a verb acts on, best first; a `!` list is all it may act on. */
const KINDS = {
  type: ['!', 'input'],
  select: ['!', 'input'],
  click: ['link', 'button', 'input'],
  hover: ['link', 'button', 'image', 'section'],
  scroll: ['section', 'heading', 'image'],
  highlight: ['section', 'image', 'heading', 'button', 'link'],
  focus: ['section', 'image', 'heading', 'input', 'button'],
};

/** Words that say what kind of thing is meant rather than what it is called. */
const KIND_WORDS = {
  ...{ button: ['button', 'link'], link: ['link', 'button'], tab: ['button', 'link'] },
  ...{ field: ['input'], input: ['input'], box: ['input'], textbox: ['input'] },
  ...{ dropdown: ['input'], menu: ['input', 'button', 'section'], checkbox: ['input'] },
  ...{ toggle: ['input', 'button'], switch: ['input', 'button'] },
  ...{ section: ['section', 'heading'], area: ['section'], part: ['section', 'heading'] },
  ...{ heading: ['heading'], headline: ['heading'], title: ['heading'] },
  ...{ image: ['image'], picture: ['image'], photo: ['image'], logo: ['image', 'link'] },
};

/** The least a name must fit to count as found. */
export const ENOUGH = 0.42;
const BONUS = [0.3, 0.2, 0.1, 0.05, 0.02];

/**
 * A spoken name without what is not part of it: quotes, a leading article,
 * and a closing word that only says the kind ("the Email field").
 * @param {string} said
 * @returns {{ name: string, kinds: string[] }} `kinds`: what the closing
 *   word says it is, when it says so
 */
export function cleanName(said) {
  const bare = String(said ?? '')
    .replace(/["“”‘’`«»]/g, '')
    .replace(/^\s*(?:the|an?)\s+/i, '')
    .trim();
  const words = bare.split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase();
  if (words.length > 1 && KIND_WORDS[last])
    return { name: words.slice(0, -1).join(' '), kinds: KIND_WORDS[last] };
  return { name: bare, kinds: [] };
}

/**
 * How well a name fits what an element is called.
 * @param {string} wanted - A cleaned name
 * @param {string} name - The element's name
 * @returns {{ quality: number, how: Match['how'] }} `quality` 0 for no fit
 */
export function nameFit(wanted, name) {
  if (wanted === name) return { quality: 1, how: 'exact' };
  if (wanted.toLowerCase() === name.toLowerCase()) return { quality: 0.97, how: 'case' };
  const [a, b] = [plain(wanted), plain(name)];
  if (!a || !b) return { quality: 0, how: 'words' };
  if (a === b) return { quality: 0.94, how: 'spelling' };
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (` ${long} `.includes(` ${short} `)) {
    const share = short.split(' ').length / long.split(' ').length;
    // The page's own longer name is a better home for a short one than the reverse.
    return { quality: (short === a ? 0.7 : 0.6) + 0.2 * share, how: 'part' };
  }
  const [mine, theirs] = [tokens(wanted), tokens(name)];
  const shared = mine.filter((word) => theirs.includes(word)).length;
  const [most, least] = [shared / mine.length, shared / theirs.length].sort((x, y) => y - x);
  // One shared word is not enough when it is a small part of both names.
  if (!shared || most < 0.5 || (shared === 1 && least < 1 / 3)) return { quality: 0, how: 'words' };
  return { quality: 0.3 + 0.25 * most + 0.05 * least, how: 'words' };
}

/**
 * The element a name means.
 * @param {string} said - The name as a person said it
 * @param {PageElement[]} elements - A snapshot's, in page order
 * @param {string} verb - The stop's `do`
 * @returns {Match|null} null when nothing on the page fits
 */
export function matchElement(said, elements, verb) {
  const { name, kinds: hinted } = cleanName(said);
  if (!name) return null;
  const [only, ...implied] = KINDS[verb]?.[0] === '!' ? KINDS[verb] : ['', ...(KINDS[verb] || [])];
  const fits = elements
    .filter((element) => !only || implied.includes(element.kind))
    .map((element) => ({ element, ...nameFit(name, element.name) }))
    .filter((fit) => fit.quality >= ENOUGH);
  // Said kind first: "the Pricing link" is a link if any link fits.
  const asSaid = fits.filter((fit) => hinted.includes(fit.element.kind));
  const pool = asSaid.length ? asSaid : fits;
  const order = asSaid.length ? hinted : implied;
  /** @type {Match|null} */
  let best = null;
  let top = -1;
  for (const fit of pool) {
    const place = order.indexOf(fit.element.kind);
    const score = fit.quality + (place < 0 ? 0 : BONUS[place] || 0);
    if (score > top + 1e-9) [best, top] = [fit, score];
  }
  return best;
}
