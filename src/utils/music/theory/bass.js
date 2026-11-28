/**
 * Bass lines from a chord sequence. Isomorphic and pure; everything that
 * looks like a choice comes from the seed.
 * @module utils/music/theory/bass
 */

import { note, pick, seeded } from './random.js';

/** @typedef {import('./chords.js').Chord} Chord */
/** @typedef {import('#utils/music/types.js').Note} Note */

/** The styles `bassLine` knows. */
export const BASS_STYLES = Object.freeze(['roots', 'octaves', 'walking', 'syncopated']);

/** Where a syncopated bar may put its notes, in beats of a 4-beat bar. */
const CELLS = [
  [0, 1.5, 2.5, 3.5],
  [0, 0.75, 1.5, 3],
  [0, 1.5, 2, 3.5],
  [0, 0.5, 1.5, 2.5, 3.25],
];

/**
 * @param {Chord} chord
 * @param {number} octave - Octave of the note (C2 = 36)
 * @returns {number} Its bass note in that octave, kept in a bass's range
 */
function rootOf(chord, octave) {
  const note = (Math.round(octave) + 1) * 12 + chord.bass;
  return Math.min(60, Math.max(24, note));
}

/**
 * Eight eighth notes that walk through a chord and lead into the next one.
 * @param {Chord} chord
 * @param {Chord} next
 * @param {number} octave
 * @param {number} count - Eighths in the chord
 * @returns {number[]} Pitches
 */
function walk(chord, next, octave, count) {
  const root = rootOf(chord, octave);
  const third = root + (chord.steps[1] ?? 7);
  const fifth = root + (chord.steps[2] ?? 7);
  // A triad borrows a sixth or a seventh to have somewhere to go.
  const colour = root + (chord.steps[3] ?? (chord.steps[1] === 3 ? 10 : 9));
  const shape = [root, third, fifth, colour, root + 12, colour, fifth, third];
  const line = Array.from({ length: count }, (_, i) => shape[i % shape.length]);
  // The last eighth is a semitone away from where the next chord starts.
  const goal = rootOf(next, octave);
  if (count > 1) line[count - 1] = goal + (line[count - 2] > goal ? 1 : -1);
  return line;
}

/**
 * Write a bass line.
 * @param {Chord[]} chords
 * @param {{ style?: string, beats?: number, octave?: number, velocity?: number, seed?: number }}
 *   [opts] - `style`: `roots` (one long note per chord), `octaves` (eighths
 *   that jump an octave), `walking` (eighths through the chord, leading into
 *   the next) or `syncopated` (a funkier bar, off the beat); `beats` per
 *   chord (default 4); `octave` of the roots (default 2: C2 = 36)
 * @returns {Note[]} `[beat, length, pitch, velocity]`, in order
 */
export function bassLine(chords, opts = {}) {
  const list = Array.isArray(chords) ? chords : [];
  const beats = opts.beats > 0 ? opts.beats : 4;
  const octave = Number.isFinite(opts.octave) ? opts.octave : 2;
  const loud = opts.velocity > 0 ? Math.min(1, opts.velocity) : 0.85;
  const random = seeded(opts.seed);
  /** @type {Note[]} */
  const notes = [];
  list.forEach((chord, index) => {
    const start = index * beats;
    const root = rootOf(chord, octave);
    if (opts.style === 'octaves' || opts.style === 'walking') {
      const count = Math.round(beats * 2);
      const line =
        opts.style === 'walking'
          ? walk(chord, list[(index + 1) % list.length], octave, count)
          : Array.from({ length: count }, (_, i) => root + (i % 2 ? 12 : 0));
      line.forEach((pitch, i) =>
        notes.push(note(start + i / 2, 0.45, pitch, i % 2 ? loud * 0.8 : loud)),
      );
    } else if (opts.style === 'syncopated') {
      const cell = pick(random, CELLS).filter((beat) => beat < beats);
      cell.forEach((beat, i) => {
        const until = (cell[i + 1] ?? beats) - beat;
        const jump = i > 0 && random() < 0.3 ? pick(random, [7, 12]) : 0;
        notes.push(
          note(start + beat, Math.min(1, until * 0.8), root + jump, i ? loud * 0.85 : loud),
        );
      });
    } else {
      for (let beat = 0; beat < beats; beat += 4) {
        notes.push(note(start + beat, Math.min(4, beats - beat) * 0.95, root, loud));
      }
    }
  });
  return notes;
}
