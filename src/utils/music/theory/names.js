/**
 * Note names and MIDI note numbers. Middle C is C4 = 60; A4 = 69 = 440 Hz.
 * Isomorphic and pure.
 * @module utils/music/theory/names
 */

/** The twelve pitch classes, sharps for the black keys. */
export const NOTE_NAMES = Object.freeze([
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]);

/** Names a song's `key` may have: every pitch class, the black keys both ways. */
export const KEY_NAMES = Object.freeze([
  ...['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#'],
  ...['Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'],
]);

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAME = /^([A-Ga-g])([#b♯♭]*)(-?\d+)?$/;

/**
 * @param {string} text - `#`, `b`, `♯` and `♭` signs
 * @returns {number} Semitones they add up to
 */
function accidentals(text) {
  let shift = 0;
  for (const sign of text) shift += sign === '#' || sign === '♯' ? 1 : -1;
  return shift;
}

/**
 * @param {any} name - `C`, `F#`, `Bb`, `e♭`; an octave number is ignored
 * @returns {number} 0 (C) … 11 (B), or −1 for anything that is not a note name
 */
export function pitchClass(name) {
  const found = typeof name === 'string' ? NAME.exec(name.trim()) : null;
  if (!found) return -1;
  return (((LETTERS[found[1].toUpperCase()] + accidentals(found[2])) % 12) + 12) % 12;
}

/**
 * @param {any} name - A note with its octave: `C4`, `F#2`, `Bb-1`
 * @returns {number} Its MIDI note number; NaN for anything else. May lie
 *   outside 0 … 127
 */
export function noteNumber(name) {
  const found = typeof name === 'string' ? NAME.exec(name.trim()) : null;
  if (!found || found[3] === undefined) return NaN;
  const letter = LETTERS[found[1].toUpperCase()];
  return (Number(found[3]) + 1) * 12 + letter + accidentals(found[2]);
}

/**
 * @param {number} pitch - MIDI note number
 * @returns {string} `C4`, `A#2`; '' for a number that is not finite
 */
export function noteName(pitch) {
  if (!Number.isFinite(pitch)) return '';
  const note = Math.round(pitch);
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
