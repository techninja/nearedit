/**
 * Chords by their place in a key: Roman numerals, upper case for major and
 * lower case for minor — `i-VI-III-VII` in A minor is Am, F, C, G.
 * Isomorphic and pure.
 * @module utils/music/theory/roman
 */

import { buildChord, chord, chordQuality } from './chords.js';
import { NOTE_NAMES, pitchClass } from './names.js';
import { scaleSteps } from './scales.js';

/** @typedef {import('./chords.js').Chord} Chord */

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
const NUMERAL = /^([b#♭♯]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;
/** What a suffix means on a minor (lower-case) numeral. */
const MINOR = { '': 'm', 7: 'm7', maj7: 'mMaj7', 6: 'm6', 9: 'm9', add9: 'madd9' };

/**
 * The seven steps numerals count on: the scale itself when it has seven
 * notes, else the major or the minor scale, whichever its third fits.
 * @param {string} scale
 * @returns {readonly number[]}
 */
function sevenSteps(scale) {
  const steps = scaleSteps(scale);
  if (steps.length === 7) return steps;
  return scaleSteps(steps.includes(4) ? 'major' : 'minor');
}

/**
 * How the notes of a key are spelled: with flats when sharps would use a
 * letter twice (F major has a Bb, not an A#).
 * @param {string} key
 * @param {string} scale
 * @returns {string[]} A name for each of the twelve pitch classes
 */
export function spelling(key, scale) {
  const root = Math.max(0, pitchClass(key));
  const letters = sevenSteps(scale).map((step) => NOTE_NAMES[(root + step) % 12][0]);
  const flat = new Set(letters).size < letters.length || /[b♭]/.test(String(key).slice(1));
  return flat ? FLAT_NAMES : [...NOTE_NAMES];
}

/**
 * The chord on a degree of a key.
 * @param {string} key - `C`, `F#`, `Bb`
 * @param {string} scale - A name in `SCALES`
 * @param {string} numeral - `i`, `IV`, `V7`, `ii°`, `bVII`, `Imaj7`, `vsus4`
 * @returns {Chord|null} null when the numeral cannot be read
 */
export function degree(key, scale, numeral) {
  const found = typeof numeral === 'string' ? NUMERAL.exec(numeral.trim()) : null;
  const tonic = pitchClass(key);
  if (!found || tonic < 0) return null;
  const [, signs, roman, suffix] = found;
  const minor = roman === roman.toLowerCase();
  const kind = chordQuality(suffix);
  if (kind === null) return null;
  const quality = minor && Object.hasOwn(MINOR, kind) ? MINOR[kind] : kind;
  let shift = 0;
  for (const sign of signs) shift += sign === '#' || sign === '♯' ? 1 : -1;
  // A plain numeral is a step of the scale; one with a sign is counted from
  // the major scale, as chord charts do: bVII is a whole tone under the key
  // note in every scale.
  const place = NUMERALS.indexOf(roman.toLowerCase());
  const step = signs ? scaleSteps('major')[place] : sevenSteps(scale)[place];
  const root = (((tonic + step + shift) % 12) + 12) % 12;
  return buildChord(root, quality, root, `${spelling(key, scale)[root]}${quality}`);
}

/**
 * A chord sequence from numerals or chord names.
 * @param {string} key
 * @param {string} scale
 * @param {string|string[]} sequence - `'i-VI-III-VII'`, `'I IV V'`, or
 *   chord names: `'Am F C G'`. Separated by spaces, commas, bars or dashes
 * @returns {Chord[]} What could be read, in order
 */
export function progression(key, scale, sequence) {
  const words = Array.isArray(sequence) ? sequence : String(sequence ?? '').split(/[\s,|–—-]+/);
  return words
    .filter((word) => typeof word === 'string' && word !== '')
    .slice(0, 256)
    .map((word) => degree(key, scale, word) || chord(word))
    .filter(Boolean);
}
