/**
 * A stop as a step of a recipe: the kind's parameters filled from the
 * stop's words and from the element its name was matched to. Timing is not
 * decided here (`pacing.js`). Reference: docs/app-spec/DIRECTOR-WEB.md
 * § From stops to a recipe. Isomorphic and pure.
 * @module utils/director/web/steps
 */

import { stepKind } from '#utils/web/stepKinds.js';
import { readKey } from './keys.js';
import { cleanName } from './match.js';
import { scrollFor } from './places.js';
import { SCROLL_WORDS, WORD_PARAM, stopNeeds } from './planSchema.js';

/** @typedef {import('./match.js').PageElement} PageElement */
/** @typedef {{ do: string, on?: string, text?: string, say?: string }} Stop */

/** How far `scroll down` goes, as a share of the picture's height. */
const SCREEN = 0.8;
/** Longest `wait` a stop may ask for, seconds. */
const MAX_WAIT = 60;

/**
 * What a `scroll` stop names when it is not something on the page.
 * @param {string|undefined} on
 * @returns {string} `top`, `bottom`, `down`, `up`, or ''
 */
export function scrollWord(on) {
  const said = String(on ?? '')
    .toLowerCase()
    .replace(/^\s*(?:the\s+)?(?:very\s+)?/, '')
    .replace(/\s+of\s+(?:the\s+)?page\s*$/, '')
    .trim();
  const word = { start: 'top', beginning: 'top', end: 'bottom' }[said] || said;
  return SCROLL_WORDS.includes(word) ? word : '';
}

/**
 * The target a name falls back on when nothing on the page was matched to
 * it: the recorder looks for it by its words when it gets there.
 * @param {Stop} stop
 * @returns {string} `label=…` for a field, `text=…` for anything else
 */
export function fallbackTarget(stop) {
  const { name } = cleanName(stop.on || '');
  if (!name) return '';
  return `${stop.do === 'type' || stop.do === 'select' ? 'label' : 'text'}=${name}`;
}

/**
 * The step of a stop.
 * @param {Stop} stop - Valid against the plan schema
 * @param {PageElement|null} element - What its name was matched to
 * @param {{ elements: PageElement[], viewport: { width: number, height: number } }} page
 * @returns {Record<string, any>} A recipe step without timing; its `note` is the caption
 */
export function stopStep(stop, element, page) {
  const kind = stepKind(stop.do);
  /** @type {Record<string, any>} */
  const step = { do: stop.do, note: stop.say || '' };
  const text = (stop.text || '').trim();
  const word = WORD_PARAM[stop.do];
  if (stop.do === 'scroll') {
    const where = scrollWord(stop.on);
    const pixels = Number(text) > 0 ? Number(text) : Math.round(SCREEN * page.viewport.height);
    if (where === 'top' || where === 'bottom') return { ...step, to: where };
    if (where) return { ...step, by: where === 'up' ? -pixels : pixels };
    if (element) return { ...step, ...scrollFor(element, page.elements, page.viewport) };
    return { ...step, to: fallbackTarget(stop), align: 'center' };
  }
  if (stopNeeds(stop.do).aims) {
    const target = element?.target || fallbackTarget(stop);
    if (target) step.target = target;
  }
  if (stop.do === 'press') {
    const combo = readKey(text.replace(/\+/g, ' '));
    return { ...step, key: combo?.key || text, modifiers: combo?.modifiers || [] };
  }
  if (stop.do === 'wait') {
    return Number(text) > 0 ? { ...step, duration: Math.min(MAX_WAIT, Number(text)) } : step;
  }
  if (!word || !text) return step;
  const options = kind?.params[word]?.options;
  // A word that is not one of a parameter's choices leaves its default in place.
  if (!options || options.includes(text.toLowerCase()))
    step[word] = options ? text.toLowerCase() : text;
  return step;
}
