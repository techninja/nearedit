/**
 * Demo plan normalisation — forgives the harmless ways a language model
 * strays from the plan's shape (synonymous keys, a bare list, a stop
 * written as a sentence, "tap" for "click") before the plan is validated.
 * What it cannot make sense of is left for validation to report.
 * @module api/director/web/normalize
 */

import { readInstruction, readLine } from '#utils/director/web/brief.js';
import { DEMO_VERBS, MAX_ON, MAX_SAY, MAX_TITLE } from '#utils/director/web/planSchema.js';
import { tidy } from '#utils/director/web/words.js';

const STOPS_KEYS = ['stops', 'steps', 'actions', 'scenes', 'sequence', 'beats', 'shots'];
const STOP_KEYS = {
  do: ['do', 'action', 'verb', 'kind', 'type', 'step'],
  on: ['on', 'target', 'element', 'name', 'what', 'where', 'into', 'in'],
  text: ['text', 'value', 'input', 'key', 'option', 'url', 'address', 'seconds', 'style'],
  say: ['say', 'caption', 'narration', 'note', 'label', 'subtitle'],
};
/** Verbs a model may write that are no sentence of a brief. */
const VERBS = {
  ...{ navigate: 'goto', visit: 'goto', zoom: 'focus', keypress: 'press', key: 'press' },
  ...{ pause: 'wait', sleep: 'wait', delay: 'wait', mouseover: 'hover', fill: 'type' },
};
/** A sample name, to read "tap" or "zoom in on" the way the brief reader does. */
const PROBE = 'the thing';

/**
 * A verb as the plan writes it: `tap` → `click`, `Zoom in` → `focus`.
 * @param {unknown} value
 * @returns {unknown} A step kind when the word is understood, else the value tidied
 */
export function tidyVerb(value) {
  if (typeof value !== 'string') return value;
  const word = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (DEMO_VERBS.includes(word)) return word;
  const squeezed = word.replace(/\s+/g, '');
  if (DEMO_VERBS.includes(squeezed)) return squeezed;
  if (VERBS[squeezed]) return VERBS[squeezed];
  return readInstruction(`${word} ${PROBE}`)?.do || readInstruction(word)?.do || word;
}

/**
 * @param {any} raw - A stop, or a sentence that says one
 * @returns {any}
 */
function normalizeStop(raw) {
  if (typeof raw === 'string') return readLine(raw)?.stop || raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  /** @type {Record<string, any>} */
  const stop = {};
  for (const [name, aliases] of Object.entries(STOP_KEYS)) {
    const alias = aliases.find((a) => raw[a] !== undefined && raw[a] !== null && raw[a] !== '');
    if (alias) stop[name] = raw[alias];
  }
  stop.do = tidyVerb(stop.do);
  for (const key of ['on', 'text', 'say']) {
    if (typeof stop[key] === 'number') stop[key] = String(stop[key]);
  }
  if (typeof stop.on === 'string') stop.on = tidy(stop.on, MAX_ON);
  if (typeof stop.say === 'string') stop.say = tidy(stop.say, MAX_SAY);
  for (const key of ['on', 'say']) if (stop[key] === '') delete stop[key];
  return stop;
}

/**
 * Bring a parsed reply into demo-plan shape.
 * @param {any} parsed - JSON value from the model
 * @returns {any}
 */
export function normalizeDemoPlan(parsed) {
  let raw = Array.isArray(parsed) ? { stops: parsed } : parsed;
  if (!raw || typeof raw !== 'object') return raw;
  const hasStops = (/** @type {any} */ o) => STOPS_KEYS.some((k) => Array.isArray(o?.[k]));
  if (!hasStops(raw)) raw = Object.values(raw).find(hasStops) || raw; // {"plan": {…}} wrappers
  /** @type {Record<string, any>} */
  const plan = {};
  const stopsKey = STOPS_KEYS.find((k) => Array.isArray(raw[k]));
  if (stopsKey) plan.stops = raw[stopsKey].map(normalizeStop);
  else if (raw.stops !== undefined) plan.stops = raw.stops;
  const title = raw.title ?? raw.headline;
  if (typeof title === 'string' && title.trim()) plan.title = tidy(title, MAX_TITLE);
  return plan;
}
