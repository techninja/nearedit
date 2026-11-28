/**
 * Chords from their names: `Am7`, `F#dim`, `Bbmaj7`, `Csus4`, `G/B`.
 * Isomorphic and pure.
 * @module utils/music/theory/chords
 */

import { NOTE_NAMES, pitchClass } from './names.js';

/**
 * @typedef {Object} Chord
 * @property {string} name - As written, or as `degree` spells it
 * @property {number} root - Pitch class of the root, 0 (C) … 11 (B)
 * @property {number} bass - Pitch class of the lowest note: the root, or
 *   what follows the slash
 * @property {string} quality - The part of the name that says what kind
 * @property {number[]} steps - Semitones above the root
 * @property {number[]} notes - MIDI note numbers, the root in the octave
 *   below middle C
 * @property {number} bassNote - The bass in the octave below that
 */

/** Kinds of chord by what follows the root in a name: semitones above the root. */
export const CHORD_QUALITIES = Object.freeze({
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  5: [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
});

/** Other ways the same kinds are written. */
const SPELLINGS = Object.fromEntries([
  ['maj', ''],
  ['M', ''],
  ['min', 'm'],
  ['-', 'm'],
  ['°', 'dim'],
  ['o', 'dim'],
  ['+', 'aug'],
  ['sus', 'sus4'],
  ['M7', 'maj7'],
  ['Δ', 'maj7'],
  ['Δ7', 'maj7'],
  ['min7', 'm7'],
  ['-7', 'm7'],
  ['ø', 'm7b5'],
  ['ø7', 'm7b5'],
  ['°7', 'dim7'],
  ['o7', 'dim7'],
  ['mM7', 'mMaj7'],
  ['minMaj7', 'mMaj7'],
  ['M9', 'maj9'],
  ['min9', 'm9'],
  ['2', 'sus2'],
  ['4', 'sus4'],
  ['min6', 'm6'],
  ['7sus', '7sus4'],
  ['mAdd9', 'madd9'],
]);

const NAME = /^([A-Ga-g][#b♯♭]*)([^/]*)(?:\/([A-Ga-g][#b♯♭]*))?$/;

/**
 * @param {string} suffix - What follows the root in a chord name
 * @returns {string|null} The key of `CHORD_QUALITIES` it means
 */
export function chordQuality(suffix) {
  if (Object.hasOwn(CHORD_QUALITIES, suffix)) return suffix;
  return Object.hasOwn(SPELLINGS, suffix) ? SPELLINGS[suffix] : null;
}

/**
 * Build a chord on a root.
 * @param {number} root - Pitch class
 * @param {string} quality - A key of `CHORD_QUALITIES`
 * @param {number} [bass] - Pitch class of the bass; the root by default
 * @param {string} [name]
 * @returns {Chord}
 */
export function buildChord(root, quality, bass = root, name) {
  const steps = [...CHORD_QUALITIES[quality]];
  return {
    name: name ?? `${NOTE_NAMES[root]}${quality}${bass === root ? '' : `/${NOTE_NAMES[bass]}`}`,
    root,
    bass,
    quality,
    steps,
    notes: steps.map((step) => 48 + root + step),
    bassNote: 36 + bass,
  };
}

/**
 * Read a chord name: a root (`C`, `F#`, `Bb`), a kind (triads, sixths,
 * sevenths, ninths, `sus2` / `sus4`, `add9`, `5`), and optionally a bass
 * note after a slash.
 * @param {any} name
 * @returns {Chord|null} null for anything that is not a chord name
 */
export function chord(name) {
  const found = typeof name === 'string' ? NAME.exec(name.trim()) : null;
  if (!found) return null;
  const quality = chordQuality(found[2]);
  const root = pitchClass(found[1]);
  if (quality === null || root < 0) return null;
  return buildChord(root, quality, found[3] ? pitchClass(found[3]) : root, name.trim());
}
