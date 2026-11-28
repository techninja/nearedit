/**
 * Mood words: what "calm", "hopeful" or "driving" do to a score. Each word
 * moves the energy (how much plays) and the brightness (how open the
 * sounds are) a little; a plan names a few, and a brief is searched for them.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The plan. Isomorphic and pure.
 * @module utils/director/score/mood
 */

/**
 * What each word adds: `[energy, brightness]`.
 * @type {Readonly<Record<string, readonly [number, number]>>}
 */
export const MOODS = Object.freeze({
  calm: [-0.25, 0],
  quiet: [-0.3, 0],
  gentle: [-0.2, 0.05],
  soft: [-0.2, 0],
  relaxed: [-0.2, 0],
  peaceful: [-0.25, 0.05],
  mellow: [-0.15, -0.1],
  dreamy: [-0.15, 0.05],
  slow: [-0.2, 0],
  minimal: [-0.25, 0],
  subtle: [-0.2, 0],
  tender: [-0.2, 0],
  warm: [0, -0.15],
  dark: [0, -0.3],
  moody: [-0.05, -0.25],
  deep: [0, -0.2],
  mysterious: [-0.1, -0.2],
  tense: [0.1, -0.15],
  sad: [-0.15, -0.2],
  melancholy: [-0.15, -0.2],
  serious: [0, -0.1],
  bright: [0, 0.3],
  happy: [0.1, 0.2],
  hopeful: [0.05, 0.15],
  uplifting: [0.15, 0.2],
  optimistic: [0.1, 0.2],
  playful: [0.1, 0.2],
  light: [-0.05, 0.2],
  airy: [-0.1, 0.25],
  sparkling: [0.05, 0.3],
  fresh: [0.05, 0.15],
  lively: [0.2, 0.1],
  upbeat: [0.2, 0.15],
  energetic: [0.3, 0.1],
  driving: [0.3, 0],
  exciting: [0.3, 0.1],
  powerful: [0.3, 0],
  intense: [0.35, -0.05],
  epic: [0.3, 0],
  bold: [0.2, 0],
  big: [0.25, 0],
  fast: [0.25, 0],
  punchy: [0.2, 0.05],
  confident: [0.1, 0],
  triumphant: [0.3, 0.15],
  busy: [0.2, 0],
});

/** The most all the words of a plan together move either measure. */
const MOST = 0.4;

/**
 * @param {any} word
 * @returns {string} The mood it names, '' when it is none
 */
function moodOf(word) {
  const name = typeof word === 'string' ? word.trim().toLowerCase() : '';
  return Object.hasOwn(MOODS, name) ? name : '';
}

/**
 * The mood words found in a text, in the order they appear, each once.
 * @param {string} text
 * @returns {string[]}
 */
export function moodsIn(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^a-z]+/);
  return [...new Set(words.map(moodOf).filter(Boolean))].slice(0, 8);
}

/**
 * What a list of mood words comes to.
 * @param {any} words - Strings; anything else, and words that are no mood, are passed over
 * @returns {{ energy: number, brightness: number, known: string[], unknown: string[] }}
 *   `energy` and `brightness`: what to add, each within ±0.4
 */
export function readMood(words) {
  const list = (Array.isArray(words) ? words : []).filter((word) => typeof word === 'string');
  const known = [...new Set(list.map(moodOf).filter(Boolean))];
  const unknown = list.filter((word) => !moodOf(word) && word.trim());
  const sum = (/** @type {0|1} */ at) => {
    const total = known.reduce((all, name) => all + MOODS[name][at], 0);
    return Math.round(Math.min(MOST, Math.max(-MOST, total)) * 100) / 100;
  };
  return { energy: sum(0), brightness: sum(1), known, unknown };
}
