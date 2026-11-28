/**
 * The harmony of a score: its key, the chord progression its sections loop
 * through, the chord that leads into every new section and the tonic chord
 * it ends on — chosen from a style's pools by the seed.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/harmony
 */

import { KEY_NAMES } from '#utils/music/theory/names.js';
import { degree, progression } from '#utils/music/theory/roman.js';
import { scaleSteps } from '#utils/music/theory/scales.js';

/** @typedef {import('#utils/music/theory/chords.js').Chord} Chord */

/**
 * @typedef {Object} Harmony
 * @property {string} key
 * @property {string} scale
 * @property {string} numerals - The progression, as it is written in the style
 * @property {Chord[]} chords - One per bar of the loop
 * @property {Chord} turn - The bar that leads into a section
 * @property {Chord} tonic - The chord the score ends on
 */

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T}
 */
export function pick(random, list) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * @param {string} scale
 * @returns {string} The numeral of its tonic chord: `I` when the scale has a major third
 */
export function tonicNumeral(scale) {
  return scaleSteps(scale).includes(4) ? 'I' : 'i';
}

/**
 * The harmony of a song in a style.
 * @param {import('./style.js').Style} style
 * @param {{ key?: string, random: () => number }} opts - `key`: one that was
 *   asked for; otherwise the seed chooses among the style's
 * @returns {Harmony}
 */
export function harmonyOf(style, { key, random }) {
  // The seed is spent the same way whether or not a key was asked for.
  const chosen = pick(random, style.keys);
  const numerals = pick(random, style.progressions);
  const home = KEY_NAMES.includes(key) ? key : chosen;
  const { scale } = style;
  return {
    key: home,
    scale,
    numerals,
    chords: progression(home, scale, numerals),
    turn: degree(home, scale, style.turn),
    tonic: degree(home, scale, tonicNumeral(scale)),
  };
}

/**
 * @param {Chord} chord
 * @returns {number[]} Its pitch classes
 */
export function chordClasses(chord) {
  return chord.steps.map((step) => (chord.root + step) % 12);
}
