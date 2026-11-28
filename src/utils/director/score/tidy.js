/**
 * Tidying the notes the theory helpers write, so that a generated song is
 * playable whatever the seed: every part inside its instrument's range, no
 * note ringing over a bar line into the next section, and no held melody
 * note a semitone away from a note of the chord under it.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/tidy
 */

import { chordClasses } from './harmony.js';

/** @typedef {import('#utils/music/types.js').Note} Note */
/** @typedef {import('#utils/music/theory/chords.js').Chord} Chord */

/**
 * The lowest and highest note each role may play (MIDI note numbers). A
 * bass never goes under E1 (41 Hz), where only a kick drum should be.
 * @type {Readonly<Record<string, readonly [number, number]>>}
 */
export const ROLE_RANGE = Object.freeze({
  bass: [28, 55],
  chords: [40, 88],
  arp: [48, 100],
  lead: [55, 96],
});

/** Semitones a melody may span: an octave and a half. */
export const MELODY_SPAN = 18;
/** Beats from which a melody note counts as held. */
const HELD = 0.75;

/**
 * Bring every note inside a range by whole octaves.
 * @param {Note[]} notes
 * @param {readonly number[]} range - `[lowest, highest]`
 * @returns {Note[]}
 */
export function foldInto(notes, [low, high]) {
  return notes.map((note) => {
    let pitch = note[2];
    while (pitch < low) pitch += 12;
    while (pitch > high) pitch -= 12;
    return pitch === note[2] ? note : [note[0], note[1], pitch, note[3]];
  });
}

/**
 * End every note at its bar line at the latest. Parts are loops that stop
 * at the end of any bar; a note tied over the line would ring into the
 * section that follows.
 * @param {Note[]} notes
 * @param {number} beatsPerBar
 * @returns {Note[]}
 */
export function withinBars(notes, beatsPerBar) {
  return notes.map((note) => {
    const room = (Math.floor(note[0] / beatsPerBar + 1e-9) + 1) * beatsPerBar - note[0];
    return note[1] <= room ? note : [note[0], Math.round(room * 1e4) / 1e4, note[2], note[3]];
  });
}

/**
 * @param {Note[]} notes
 * @returns {number} Semitones between its lowest and highest note
 */
export function spanOf(notes) {
  if (!notes.length) return 0;
  const pitches = notes.map((note) => note[2]);
  return Math.max(...pitches) - Math.min(...pitches);
}

/**
 * Whether a pitch grinds against a chord: it lies a semitone above or
 * below one of the chord's notes, in any octave — a minor second or a
 * minor ninth against whichever instrument plays that note, the interval
 * that sounds like a wrong note when it is held.
 * @param {number} pitch
 * @param {Chord} chord
 * @returns {boolean}
 */
export function grinds(pitch, chord) {
  return chordClasses(chord).some((tone) => [1, 11].includes((((pitch - tone) % 12) + 12) % 12));
}

/**
 * Move the held notes of a melody that grind against the chord under them
 * to the nearest note of that chord that does not.
 * @param {Note[]} notes
 * @param {Chord[]} chords - One per `beats`, repeating
 * @param {number} beats - Beats per chord
 * @returns {Note[]}
 */
export function settle(notes, chords, beats) {
  if (!chords.length) return notes;
  return notes.map((note) => {
    const chord = chords[Math.floor(note[0] / beats + 1e-9) % chords.length];
    if (note[1] < HELD || !grinds(note[2], chord)) return note;
    const tones = chordClasses(chord);
    for (let away = 1; away < 12; away++) {
      for (const pitch of [note[2] - away, note[2] + away]) {
        const safe = tones.includes(((pitch % 12) + 12) % 12) && !grinds(pitch, chord);
        if (safe) return [note[0], note[1], pitch, note[3]];
      }
    }
    return note;
  });
}
