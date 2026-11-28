/**
 * Score plan normalisation — forgives the harmless ways a language model
 * strays from the plan's shape (other words for a key, a mood written as
 * one sentence, "120 bpm", "A minor", an energy of "high" or 80) before
 * the plan is validated. What it cannot make sense of is left for
 * validation to report. Names are only tidied here, never judged: an
 * unknown style or section is dealt with when the plan is completed.
 * @module api/director/score/normalize
 */

import { MAX_MOODS } from '#utils/director/score/planSchema.js';

const KEYS = {
  style: ['style', 'genre', 'styleId', 'style_id'],
  mood: ['mood', 'moods', 'feel', 'feeling', 'vibe', 'tone'],
  sections: ['sections', 'structure', 'parts', 'arc', 'form', 'arrangement'],
  bpm: ['bpm', 'tempo'],
  key: ['key', 'tonality'],
};
const SECTION_KEYS = {
  name: ['name', 'section', 'kind', 'type', 'label'],
  share: ['share', 'length', 'weight', 'portion', 'percent', 'bars', 'duration'],
  energy: ['energy', 'level', 'intensity'],
};
const LEVELS = { low: 0.3, quiet: 0.3, soft: 0.3, medium: 0.55, mid: 0.55, high: 0.9, full: 1 };

/**
 * The first of several names an object has a value under.
 * @param {Record<string, any>} from
 * @param {string[]} names
 * @returns {any}
 */
function under(from, names) {
  const name = names.find(
    (key) => from[key] !== undefined && from[key] !== null && from[key] !== '',
  );
  return name ? from[name] : undefined;
}

/**
 * @param {unknown} value - 0.8, 80, "80%", "high"
 * @returns {unknown} A number 0 … 1 when understood, else the value untouched
 */
export function toLevel(value) {
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    if (Object.hasOwn(LEVELS, word)) return LEVELS[word];
    if (/^\d+(\.\d+)?\s*%?$/.test(word)) return toLevel(parseFloat(word));
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return value > 1 && value <= 100 ? value / 100 : value;
}

/**
 * @param {unknown} value - 3, "3", "30%", "8 bars"
 * @returns {unknown} A number when understood
 */
function toShare(value) {
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?/.test(value)) return parseFloat(value);
  return value;
}

/**
 * @param {any} raw - A section, or just its name
 * @returns {any}
 */
function normalizeSection(raw) {
  if (typeof raw === 'string') return { name: raw.trim().toLowerCase() };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  /** @type {Record<string, any>} */
  const section = {};
  const name = under(raw, SECTION_KEYS.name);
  if (name !== undefined)
    section.name = typeof name === 'string' ? name.trim().toLowerCase() : name;
  const share = toShare(under(raw, SECTION_KEYS.share));
  if (share !== undefined) section.share = share;
  const energy = toLevel(under(raw, SECTION_KEYS.energy));
  if (energy !== undefined) section.energy = energy;
  return section;
}

/**
 * Bring a parsed reply into score-plan shape.
 * @param {any} parsed - JSON value from the model
 * @returns {any}
 */
export function normalizeScorePlan(parsed) {
  let raw = parsed;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const known = (/** @type {any} */ o) =>
    o &&
    typeof o === 'object' &&
    Object.values(KEYS).some((names) => under(o, names) !== undefined);
  if (!known(raw)) raw = Object.values(raw).find(known) || raw; // {"plan": {…}} wrappers
  /** @type {Record<string, any>} */
  const plan = {};
  const style = under(raw, KEYS.style);
  if (style !== undefined) {
    plan.style = typeof style === 'string' ? style.trim().toLowerCase().slice(0, 40) : style;
  }
  const mood = under(raw, KEYS.mood);
  // "calm, hopeful and warm" is three words.
  const words = typeof mood === 'string' ? mood.split(/[,;/]|\band\b/) : mood;
  if (Array.isArray(words)) {
    plan.mood = words
      .map((word) => (typeof word === 'string' ? word.trim().toLowerCase() : word))
      .filter((word) => word !== '')
      .slice(0, MAX_MOODS);
  } else if (mood !== undefined) plan.mood = mood;
  const sections = under(raw, KEYS.sections);
  if (Array.isArray(sections)) plan.sections = sections.map(normalizeSection);
  else if (sections !== undefined) plan.sections = sections;
  const bpm = under(raw, KEYS.bpm);
  if (bpm !== undefined) plan.bpm = typeof bpm === 'string' ? toShare(bpm) : bpm;
  const key = under(raw, KEYS.key);
  // "A minor" names the key A: major or minor follows from the style.
  if (key !== undefined) plan.key = typeof key === 'string' ? key.trim().split(/\s+/)[0] : key;
  return plan;
}
