/**
 * The notes of a synth part: `[beat, length, pitch, velocity]`, beats from
 * the start of the part's loop. Isomorphic and pure.
 * @module utils/music/notes
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { numberIn, own, toNumber } from '#utils/web/coerce.js';
import { DEFAULT_VELOCITY, SONG_LIMITS as LIMITS } from './limits.js';
import { noteNumber } from './theory/names.js';

/** @typedef {import('./types.js').Note} Note */

/** Raw entries looked at for every note that may be kept. */
const SCAN = 4;

/** @type {(value: number, digits: number) => number} Rounded, so equal notes read the same. */
const rounded = (value, digits) => Math.round(value * digits) / digits;

/**
 * @param {any} pitch - A MIDI note number or a name like `C4`
 * @returns {number} A whole note number; NaN when it is neither
 */
export function pitchOf(pitch) {
  const number =
    typeof pitch === 'string' && Number.isNaN(Number(pitch)) ? noteNumber(pitch) : pitch;
  return Math.round(toNumber(number, NaN));
}

/**
 * The four numbers of one note as they were written.
 * @param {any} raw - `[beat, length, pitch, velocity]` or an object with those names
 * @returns {any[]|null}
 */
export function noteFields(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 4);
  if (!isPlainObject(raw)) return null;
  return ['beat', 'length', 'pitch', 'velocity'].map((name) => own(raw, name));
}

/**
 * Normalise one note.
 * @param {any} raw
 * @param {number} loop - Beats of the part's loop
 * @returns {Note|null} null for a note without a start inside the loop, a
 *   pitch in 0 … 127 or any velocity
 */
export function cleanNote(raw, loop) {
  const fields = noteFields(raw);
  if (!fields) return null;
  const beat = toNumber(fields[0], NaN);
  const pitch = pitchOf(fields[2]);
  const velocity = numberIn(fields[3], DEFAULT_VELOCITY, 0, 1);
  if (!(beat >= 0 && beat < loop) || !(pitch >= LIMITS.pitch[0] && pitch <= LIMITS.pitch[1])) {
    return null;
  }
  if (!(velocity > 0)) return null;
  const length = numberIn(fields[1], 1, LIMITS.length[0], LIMITS.length[1]);
  return [rounded(beat, 1e6), rounded(length, 1e6), pitch, rounded(velocity, 1e4) || 1e-4];
}

/**
 * Normalise a part's notes: at most 4000, in order of beat then pitch, one
 * note per beat and pitch.
 * @param {any} raw
 * @param {number} loop - Beats of the part's loop
 * @returns {Note[]}
 */
export function cleanNotes(raw, loop) {
  const given = Array.isArray(raw) ? raw.slice(0, LIMITS.notes * SCAN) : [];
  /** @type {Note[]} */
  const notes = [];
  for (const entry of given) {
    const note = notes.length < LIMITS.notes ? cleanNote(entry, loop) : null;
    if (note) notes.push(note);
  }
  notes.sort((a, b) => a[0] - b[0] || a[2] - b[2] || b[1] - a[1] || b[3] - a[3]);
  return notes.filter(
    (note, i) => i === 0 || note[0] !== notes[i - 1][0] || note[2] !== notes[i - 1][2],
  );
}

/**
 * @param {any} raw - Notes as written
 * @returns {number} The beat the last of them starts on; 0 when there are none
 */
export function lastBeat(raw) {
  let last = 0;
  for (const entry of Array.isArray(raw) ? raw.slice(0, LIMITS.notes * SCAN) : []) {
    const beat = toNumber(noteFields(entry)?.[0], NaN);
    if (beat > last) last = beat;
  }
  return last;
}
