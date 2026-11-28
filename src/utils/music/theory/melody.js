/**
 * A melody over a chord sequence: something a person could sing — it moves
 * mostly by steps of the scale, lands on a note of the chord whenever a
 * chord begins, and ends every phrase on a long chord note followed by a
 * breath. Isomorphic and pure; every choice comes from the seed.
 * @module utils/music/theory/melody
 */

import { note, pick, seeded } from './random.js';
import { inScale } from './scales.js';

/** @typedef {import('./chords.js').Chord} Chord */
/** @typedef {import('#utils/music/types.js').Note} Note */

/** How a beat may be filled: lengths of its notes (0 = a rest for that beat). */
const RHYTHMS = [[1], [1], [0.5, 0.5], [0.5, 0.5], [1.5, 0.5], [2], [0]];
/** Steps of the scale a note moves by, as often as each should happen. */
const MOVES = [-1, -1, -1, 1, 1, 1, 1, 0, -2, 2, 3, -3];

/**
 * @param {number[]} pool - Ascending
 * @param {number} pitch
 * @param {(note: number) => boolean} [wanted]
 * @returns {number} Index of the note of the pool nearest to a pitch
 */
function nearest(pool, pitch, wanted = () => true) {
  let best = 0;
  let least = Infinity;
  pool.forEach((note, i) => {
    const away = Math.abs(note - pitch);
    if (wanted(note) && away < least) [best, least] = [i, away];
  });
  return best;
}

/**
 * Write a melody.
 * @param {Chord[]} chords
 * @param {{ key?: string, scale?: string, beats?: number, octave?: number, phrase?: number,
 *   velocity?: number, seed?: number }} [opts] - `key` and `scale` it stays
 *   in (default C minor); `beats` per chord (default 4); `octave` it sits in
 *   (default 5: C5 = 72 and an octave around it); `phrase`: chords per
 *   phrase (default 2)
 * @returns {Note[]}
 */
export function melody(chords, opts = {}) {
  const list = Array.isArray(chords) ? chords : [];
  const beats = opts.beats > 0 ? opts.beats : 4;
  const loud = opts.velocity > 0 ? Math.min(1, opts.velocity) : 0.75;
  const phrase = Math.max(1, Math.round(opts.phrase) || 2) * beats;
  const middle = (Math.round(Number.isFinite(opts.octave) ? opts.octave : 5) + 1) * 12;
  const key = opts.key ?? 'C';
  const scale = opts.scale ?? 'minor';
  const pool = [];
  for (let note = middle - 5; note <= middle + 14; note++) {
    if (note >= 0 && note <= 127 && inScale(note, key, scale)) pool.push(note);
  }
  if (!pool.length || !list.length) return [];
  const random = seeded(opts.seed);
  const chordAt = (beat) => list[Math.min(list.length - 1, Math.floor(beat / beats))];
  const inChord = (chord) => (note) =>
    chord.steps.some((step) => (note - chord.root - step) % 12 === 0);
  let at = nearest(pool, middle, inChord(list[0]));
  /** @type {Note[]} */
  const notes = [];
  for (let start = 0; start < list.length * beats; start += phrase) {
    const end = Math.min(list.length * beats, start + phrase);
    // The phrase closes two beats before its end, on a chord note, and breathes.
    const close = Math.max(start, end - 2);
    for (let beat = start; beat < close; ) {
      const lengths = pick(random, RHYTHMS).filter((length) => beat + length <= close);
      if (!lengths.length || lengths[0] === 0) {
        beat += 1;
        continue;
      }
      for (const length of lengths) {
        const onChord = beat % beats === 0;
        at = Math.min(pool.length - 1, Math.max(0, at + pick(random, MOVES)));
        // Near the edges of its range the line turns back.
        if (at === 0 || at === pool.length - 1) at += at === 0 ? 1 : -1;
        if (onChord) at = nearest(pool, pool[at], inChord(chordAt(beat)));
        notes.push(note(beat, length * 0.92, pool[at], onChord ? loud : loud * 0.85));
        beat += length;
      }
    }
    at = nearest(pool, pool[at], inChord(chordAt(close)));
    notes.push(note(close, Math.max(0.5, end - close - 0.5), pool[at], loud));
  }
  return notes;
}
