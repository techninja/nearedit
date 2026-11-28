/**
 * Scales, as data: the semitones above the key note. Isomorphic and pure.
 * @module utils/music/theory/scales
 */

import { pitchClass } from './names.js';

/**
 * @param {string} label
 * @param {number[]} steps
 * @returns {{ label: string, steps: readonly number[] }}
 */
const scale = (label, steps) => Object.freeze({ label, steps: Object.freeze(steps) });

/**
 * Every scale a song's `scale` may name.
 * @type {Readonly<Record<string, { label: string, steps: readonly number[] }>>}
 */
export const SCALES = Object.freeze({
  major: scale('Major', [0, 2, 4, 5, 7, 9, 11]),
  minor: scale('Minor', [0, 2, 3, 5, 7, 8, 10]),
  dorian: scale('Dorian', [0, 2, 3, 5, 7, 9, 10]),
  phrygian: scale('Phrygian', [0, 1, 3, 5, 7, 8, 10]),
  lydian: scale('Lydian', [0, 2, 4, 6, 7, 9, 11]),
  mixolydian: scale('Mixolydian', [0, 2, 4, 5, 7, 9, 10]),
  locrian: scale('Locrian', [0, 1, 3, 5, 6, 8, 10]),
  harmonicMinor: scale('Harmonic minor', [0, 2, 3, 5, 7, 8, 11]),
  melodicMinor: scale('Melodic minor', [0, 2, 3, 5, 7, 9, 11]),
  majorPentatonic: scale('Major pentatonic', [0, 2, 4, 7, 9]),
  minorPentatonic: scale('Minor pentatonic', [0, 3, 5, 7, 10]),
  blues: scale('Blues', [0, 3, 5, 6, 7, 10]),
  chromatic: scale('Chromatic', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
});

/**
 * @param {string} name
 * @returns {readonly number[]} The scale's steps; the minor scale's for an unknown name
 */
export function scaleSteps(name) {
  return (Object.hasOwn(SCALES, name) ? SCALES[name] : SCALES.minor).steps;
}

/**
 * The notes of a scale, upwards from the key note.
 * @param {string} key - `C`, `F#`, `Bb`
 * @param {string} scale - A name in `SCALES`
 * @param {number} [octave=4] - Octave of the first note (C4 = 60)
 * @param {number} [octaves=1] - How many octaves; the top key note is included
 * @returns {number[]} MIDI note numbers within 0 … 127; `[]` for an unknown key
 */
export function scaleNotes(key, scale, octave = 4, octaves = 1) {
  const root = pitchClass(key);
  if (root < 0) return [];
  const steps = scaleSteps(scale);
  const base = (Math.round(octave) + 1) * 12 + root;
  const notes = [];
  for (let o = 0; o < Math.max(1, Math.round(octaves)); o++) {
    for (const step of steps) notes.push(base + o * 12 + step);
  }
  notes.push(base + Math.max(1, Math.round(octaves)) * 12);
  return notes.filter((note) => note >= 0 && note <= 127);
}

/**
 * @param {number} pitch - MIDI note number
 * @param {string} key
 * @param {string} scale
 * @returns {boolean} True when the note belongs to the scale
 */
export function inScale(pitch, key, scale) {
  const root = pitchClass(key);
  return root >= 0 && scaleSteps(scale).includes((((Math.round(pitch) - root) % 12) + 12) % 12);
}

/**
 * The scale note nearest to a pitch (the lower one when two are as near).
 * @param {number} pitch
 * @param {string} key
 * @param {string} scale
 * @returns {number}
 */
export function snapToScale(pitch, key, scale) {
  const note = Math.round(pitch);
  for (let away = 0; away < 12; away++) {
    if (inScale(note - away, key, scale)) return note - away;
    if (inScale(note + away, key, scale)) return note + away;
  }
  return note;
}
