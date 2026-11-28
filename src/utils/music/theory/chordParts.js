/**
 * Pads and arpeggios from a chord sequence. Isomorphic and pure; everything
 * that looks like a choice comes from the seed.
 * @module utils/music/theory/chordParts
 */

import { note, seeded } from './random.js';
import { voiceLead } from './voicing.js';

/** @typedef {import('./chords.js').Chord} Chord */
/** @typedef {import('#utils/music/types.js').Note} Note */

/** The orders `arpeggio` can play a chord in. */
export const ARP_MODES = Object.freeze(['up', 'down', 'updown', 'random']);

/**
 * Held chords, voiced so that each moves as little as it can from the one
 * before (`voiceLead`).
 * @param {Chord[]} chords
 * @param {{ beats?: number, center?: number, velocity?: number, gap?: number }} [opts] -
 *   `beats` per chord (default 4); `center`: the MIDI note the chords stay
 *   around (default 60); `gap`: beats of silence before the next chord
 * @returns {Note[]}
 */
export function padNotes(chords, opts = {}) {
  const beats = opts.beats > 0 ? opts.beats : 4;
  const loud = opts.velocity > 0 ? Math.min(1, opts.velocity) : 0.6;
  const gap = opts.gap >= 0 ? Math.min(beats / 2, opts.gap) : 0.05;
  return voiceLead(chords, opts).flatMap((notes, index) =>
    notes.map((pitch) => note(index * beats, beats - gap, pitch, loud)),
  );
}

/**
 * The order one run through a chord's notes is played in.
 * @param {number[]} pool - Ascending
 * @param {string} mode
 * @returns {number[]}
 */
function order(pool, mode) {
  if (mode === 'down') return [...pool].reverse();
  if (mode === 'updown' && pool.length > 2) return [...pool, ...pool.slice(1, -1).reverse()];
  return pool;
}

/**
 * A chord sequence played one note at a time.
 * @param {Chord[]} chords
 * @param {{ beats?: number, mode?: string, rate?: number, octaves?: number, octave?: number,
 *   gate?: number, velocity?: number, seed?: number }} [opts] - `mode`: `up`,
 *   `down`, `updown` or `random`; `rate`: notes per beat (default 2, eighths;
 *   4 = sixteenths); `octaves` the chord is spread over (default 1);
 *   `octave` of its lowest note (default 4); `gate`: how much of its step a
 *   note sounds (default 0.8)
 * @returns {Note[]}
 */
export function arpeggio(chords, opts = {}) {
  const beats = opts.beats > 0 ? opts.beats : 4;
  const rate = opts.rate > 0 ? Math.min(8, opts.rate) : 2;
  const octaves = Math.min(4, Math.max(1, Math.round(opts.octaves) || 1));
  const base = (Math.round(Number.isFinite(opts.octave) ? opts.octave : 4) + 1) * 12;
  const gate = opts.gate > 0 ? Math.min(1, opts.gate) : 0.8;
  const loud = opts.velocity > 0 ? Math.min(1, opts.velocity) : 0.7;
  const random = seeded(opts.seed);
  /** @type {Note[]} */
  const notes = [];
  (Array.isArray(chords) ? chords : []).forEach((chord, index) => {
    const pool = [];
    for (let o = 0; o < octaves; o++) {
      for (const step of chord.steps) pool.push(base + chord.root + step + o * 12);
    }
    const run = order(pool, opts.mode);
    let last = -1;
    for (let i = 0; i < Math.round(beats * rate); i++) {
      let at = i % run.length;
      // A random walk never plays the same note twice in a row.
      for (let tries = 0; opts.mode === 'random' && tries < 8; tries++) {
        at = Math.floor(random() * run.length);
        if (at !== last || run.length === 1) break;
      }
      last = at;
      const accent = i % rate === 0 ? loud : loud * 0.8;
      notes.push(note(index * beats + i / rate, gate / rate, Math.min(127, run[at]), accent));
    }
  });
  return notes;
}
