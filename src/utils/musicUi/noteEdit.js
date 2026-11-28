/**
 * Changes to the notes of a synth part, as pure functions. A note is
 * `[beat, length, pitch, velocity]`; it is known by where it starts — its
 * key, `beat:pitch` — because a part holds one note per beat and pitch.
 * Every function returns the notes as the song will store them (cleaned,
 * in order) and the keys of the notes it was about, so a selection
 * survives its own move.
 * @module utils/musicUi/noteEdit
 */

import { DEFAULT_VELOCITY } from '#utils/music/limits.js';
import { cleanNotes } from '#utils/music/notes.js';

/** @typedef {import('#utils/music/types.js').Note} Note */
/** @typedef {{ notes: Note[], keys: string[] }} NoteChange */

/** @type {(value: number) => number} As a stored beat is rounded */
const rounded = (value) => Math.round(value * 1e6) / 1e6;

/**
 * @param {number[]} note - At least `[beat, length, pitch]`
 * @returns {string} What the note is known by
 */
export const noteKey = (note) => `${rounded(note[0])}:${Math.round(note[2])}`;

/**
 * @param {number} value
 * @param {number} step - 0 = no grid
 * @returns {number} The nearest multiple of the step
 */
export function snapTo(value, step) {
  return step > 0 ? rounded(Math.round(value / step) * step) : value;
}

/**
 * Add a note. Where one already starts, that one is kept.
 * @param {Note[]} notes
 * @param {{ beat: number, pitch: number, length?: number, velocity?: number }} note
 * @param {number} loop - Beats of the part's loop
 * @returns {NoteChange} `keys` names the note that is there now
 */
export function addNote(notes, { beat, pitch, length = 1, velocity = DEFAULT_VELOCITY }, loop) {
  const made = [rounded(beat), length, Math.round(pitch), velocity];
  const key = noteKey(made);
  if (notes.some((note) => noteKey(note) === key)) return { notes, keys: [key] };
  const next = cleanNotes([...notes, made], loop);
  return { notes: next, keys: next.some((note) => noteKey(note) === key) ? [key] : [] };
}

/**
 * @param {Note[]} notes
 * @param {string[]} keys
 * @returns {NoteChange} Without those notes; nothing is selected afterwards
 */
export function removeNotes(notes, keys) {
  const gone = new Set(keys);
  return { notes: notes.filter((note) => !gone.has(noteKey(note))), keys: [] };
}

/**
 * Change the chosen notes, each by the same rule. A changed note that
 * lands where another note starts replaces it.
 * @param {Note[]} notes
 * @param {string[]} keys
 * @param {number} loop
 * @param {(note: Note) => Note} change
 * @returns {NoteChange}
 */
function changeNotes(notes, keys, loop, change) {
  const chosen = new Set(keys);
  const moved = notes.filter((note) => chosen.has(noteKey(note))).map(change);
  const landed = new Set(moved.map(noteKey));
  const others = notes.filter((n) => !chosen.has(noteKey(n)) && !landed.has(noteKey(n)));
  const next = cleanNotes([...moved, ...others], loop);
  const there = new Set(next.map(noteKey));
  return { notes: next, keys: [...landed].filter((key) => there.has(key)) };
}

/**
 * Move notes in time and pitch, together: the move is cut short so that
 * none leaves the loop or the range of pitches.
 * @param {Note[]} notes
 * @param {string[]} keys
 * @param {number} beats
 * @param {number} semitones
 * @param {number} loop
 * @param {(pitch: number) => number} [fit] - Where a moved note's pitch
 *   settles (the nearest note of a scale); default: where it was moved to
 * @returns {NoteChange}
 */
export function moveNotes(notes, keys, beats, semitones, loop, fit = (pitch) => pitch) {
  const chosen = notes.filter((note) => keys.includes(noteKey(note)));
  if (!chosen.length) return { notes, keys: [] };
  const first = Math.min(...chosen.map((note) => note[0]));
  const last = Math.max(...chosen.map((note) => note[0]));
  const low = Math.min(...chosen.map((note) => note[2]));
  const high = Math.max(...chosen.map((note) => note[2]));
  const room = Math.max(0, loop - last - 1e-6);
  const by = Math.max(-first, Math.min(room, beats));
  const up = Math.max(-low, Math.min(127 - high, Math.round(semitones)));
  return changeNotes(notes, keys, loop, ([beat, length, pitch, velocity]) => {
    return [rounded(beat + by), length, fit(pitch + up), velocity];
  });
}

/**
 * Make notes longer or shorter by the same amount.
 * @param {Note[]} notes
 * @param {string[]} keys
 * @param {number} beats
 * @param {number} least - Shortest a note may become
 * @param {number} loop
 * @returns {NoteChange}
 */
export function resizeNotes(notes, keys, beats, least, loop) {
  return changeNotes(notes, keys, loop, ([beat, length, pitch, velocity]) => {
    return [beat, Math.max(least, rounded(length + beats)), pitch, velocity];
  });
}

/**
 * @param {Note[]} notes
 * @param {string[]} keys
 * @param {number} velocity - 0 … 1; a note is never silent
 * @param {number} loop
 * @returns {NoteChange}
 */
export function setVelocity(notes, keys, velocity, loop) {
  const loud = Math.min(1, Math.max(0.01, velocity));
  return changeNotes(notes, keys, loop, ([beat, length, pitch]) => [beat, length, pitch, loud]);
}

/**
 * @param {Note[]} notes
 * @param {{ beat0: number, beat1: number, pitch0: number, pitch1: number }} box - In any order
 * @returns {string[]} Keys of the notes that touch the box
 */
export function notesInBox(notes, { beat0, beat1, pitch0, pitch1 }) {
  const [from, to] = [Math.min(beat0, beat1), Math.max(beat0, beat1)];
  const [low, high] = [Math.min(pitch0, pitch1), Math.max(pitch0, pitch1)];
  return notes
    .filter(
      ([beat, length, pitch]) => beat < to && beat + length > from && pitch >= low && pitch <= high,
    )
    .map(noteKey);
}
