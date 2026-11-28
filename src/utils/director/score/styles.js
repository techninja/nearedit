/**
 * The scoring styles — what the director can write music in. Each is data
 * (`style.js`) in a file of its own under `styles/`; adding a style is
 * adding a file and a line here, and the tests then hold it to the same
 * rules as the others.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Styles. Isomorphic and pure.
 * @module utils/director/score/styles
 */

import ambient from './styles/ambient.js';
import bossa from './styles/bossa.js';
import breakbeat from './styles/breakbeat.js';
import cinematic from './styles/cinematic.js';
import corporate from './styles/corporate.js';
import hiphop from './styles/hiphop.js';
import house from './styles/house.js';
import lofi from './styles/lofi.js';
import synthwave from './styles/synthwave.js';
import waltz from './styles/waltz.js';

/** @typedef {import('./style.js').Style} Style */

/** The choice that lets the director pick a style from the timeline. */
export const AUTO = 'auto';

/** @type {readonly Style[]} In the order the form lists them: calmest first. */
export const STYLES = Object.freeze([
  ambient,
  lofi,
  bossa,
  waltz,
  cinematic,
  corporate,
  synthwave,
  hiphop,
  house,
  breakbeat,
]);

/** The ids of the styles, in order. */
export const STYLE_IDS = Object.freeze(STYLES.map((style) => style.id));

/**
 * @param {any} id
 * @returns {Style|null} null for a name that is not a style
 */
export function getStyle(id) {
  return STYLES.find((style) => style.id === id) || null;
}

/** Other words people and language models use for a style. */
const WORDS = {
  'lo-fi': 'lofi',
  'lofi hip hop': 'lofi',
  chill: 'lofi',
  chillhop: 'lofi',
  upbeat: 'corporate',
  'upbeat corporate': 'corporate',
  'bossa nova': 'bossa',
  latin: 'bossa',
  'hip hop': 'hiphop',
  trap: 'hiphop',
  rap: 'hiphop',
  techno: 'house',
  edm: 'house',
  disco: 'house',
  retro: 'synthwave',
  eighties: 'synthwave',
  '80s': 'synthwave',
  retrowave: 'synthwave',
  orchestral: 'cinematic',
  epic: 'cinematic',
  trailer: 'cinematic',
  folk: 'waltz',
  acoustic: 'waltz',
  atmospheric: 'ambient',
  drone: 'ambient',
  'drum and bass': 'breakbeat',
  dnb: 'breakbeat',
  jungle: 'breakbeat',
  breaks: 'breakbeat',
};

/**
 * A style by any of its names: its id, its label, or another common word
 * for it, however it is capitalised or spaced.
 * @param {any} name
 * @returns {Style|null}
 */
export function findStyle(name) {
  if (typeof name !== 'string') return null;
  const word = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
  const plain = word.replace(/[\s-]/g, '');
  return (
    STYLES.find((style) => style.id === plain || style.label.toLowerCase() === word) ||
    getStyle(WORDS[word] ?? WORDS[word.replace(/-/g, ' ')]) ||
    null
  );
}

/**
 * The style a text names first, if any: "a lo-fi bed, calm" → lofi.
 * @param {string} text
 * @returns {Style|null}
 */
export function styleInText(text) {
  const lower = ` ${String(text || '').toLowerCase()} `;
  /** @type {{ at: number, style: Style }|null} */
  let first = null;
  const names = [
    ...STYLES.flatMap((style) => [
      [style.id, style.id],
      [style.label.toLowerCase(), style.id],
    ]),
    ...Object.entries(WORDS),
  ];
  for (const [word, id] of names) {
    const found = new RegExp(`[^a-z0-9]${word.replace(/[-\s]/g, '[-\\s]?')}[^a-z0-9]`).exec(lower);
    if (found && (!first || found.index < first.at)) {
      first = { at: found.index, style: getStyle(id) };
    }
  }
  return first ? first.style : null;
}
