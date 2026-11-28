/**
 * Reading the notes of a generated score, for tests: nobody can listen to a
 * test run, so what the generator writes is judged the way a musician would
 * judge a lead sheet — which notes sound together, what the bass does on
 * the first beat, how far a melody travels, what the last bar comes to
 * rest on. Not part of the runtime API — import it from tests.
 * @module utils/director/score/testing/read
 */

import { unrollPart } from '#utils/music/unroll.js';

/**
 * @typedef {{ part: string, beat: number, end: number, pitch: number }} Sounding - One
 *   note of the song, in beats from its start
 */

/**
 * Every note every synth part plays, along the whole song.
 * @param {any} song - Normalised
 * @returns {Sounding[]} In order of beat
 */
export function soundings(song) {
  return song.parts
    .filter((part) => part.kind === 'synth')
    .flatMap((part) =>
      unrollPart(song, part).map(([beat, pitch, , length]) => ({
        part: part.name,
        beat,
        end: beat + length,
        pitch,
      })),
    )
    .sort((a, b) => a.beat - b.beat);
}

/**
 * The places where two parts hold notes a semitone apart (a minor second,
 * or a minor ninth: the same clash an octave wider).
 * @param {any} song - Normalised
 * @param {number} [held=0.75] - Beats two notes must sound together to count
 * @returns {{ beat: number, a: Sounding, b: Sounding }[]}
 */
export function clashes(song, held = 0.75) {
  const notes = soundings(song);
  const found = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length && notes[j].beat < notes[i].end; j++) {
      const [a, b] = [notes[i], notes[j]];
      const apart = Math.abs(a.pitch - b.pitch);
      const together = Math.min(a.end, b.end) - b.beat;
      if (a.part !== b.part && (apart === 1 || apart === 13) && together >= held - 1e-9) {
        found.push({ beat: b.beat, a, b });
      }
    }
  }
  return found;
}

/**
 * @param {any} song - Normalised
 * @param {string} name - A part
 * @returns {number[]} The lowest and highest note it plays; `[]` when it plays none
 */
export function rangeOf(song, name) {
  const pitches = soundings(song)
    .filter((note) => note.part === name)
    .map((note) => note.pitch);
  return pitches.length ? [Math.min(...pitches), Math.max(...pitches)] : [];
}

/**
 * What sounds in one bar of the song.
 * @param {any} song - Normalised
 * @param {number} bar
 * @returns {Sounding[]} The notes that begin in it
 */
export function barNotes(song, bar) {
  const [from, to] = [bar * song.beatsPerBar, (bar + 1) * song.beatsPerBar];
  return soundings(song).filter((note) => note.beat >= from - 1e-9 && note.beat < to - 1e-9);
}

/**
 * The first beat of every bar in which a part plays: the pitch class it
 * plays there, or −1 when it enters the bar late.
 * @param {any} song - Normalised
 * @param {string} name - A part
 * @returns {Map<number, number>} Bar → pitch class
 */
export function downbeats(song, name) {
  /** @type {Map<number, number>} */
  const found = new Map();
  for (const note of soundings(song).filter((entry) => entry.part === name)) {
    const bar = Math.floor(note.beat / song.beatsPerBar + 1e-9);
    const first = Math.abs(note.beat - bar * song.beatsPerBar) < 1e-6;
    if (!found.has(bar)) found.set(bar, first ? note.pitch % 12 : -1);
  }
  return found;
}

/**
 * The parts that never sound.
 * @param {any} song - Normalised
 * @returns {string[]} Their names
 */
export function silentParts(song) {
  return song.parts
    .filter((part) => part.mute || unrollPart(song, part, 1).length === 0)
    .map((part) => part.name);
}
