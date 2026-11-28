/**
 * Reading a Standard MIDI File: formats 0 and 1, running status, tempo and
 * time-signature events, notes (a note-on with velocity 0 ends a note). It
 * takes what it can from a damaged file and says what it left out; it never
 * throws. Isomorphic and pure.
 * @module utils/music/midi/parse
 */

import { readTrack } from './track.js';

/**
 * @typedef {Object} MidiNote
 * @property {number} track
 * @property {number} channel - 0 … 15; 9 is the drum channel
 * @property {number} pitch - 0 … 127
 * @property {number} velocity - 1 … 127
 * @property {number} tick - When it starts
 * @property {number} ticks - How long it lasts
 * @property {number} program - The channel's program when it started
 */

/**
 * @typedef {Object} Midi
 * @property {number} format - 0 or 1 (2 is read like 1)
 * @property {number} division - Ticks per quarter note
 * @property {{ name: string }[]} tracks
 * @property {{ tick: number, bpm: number }[]} tempos
 * @property {{ tick: number, numerator: number, denominator: number }[]} signatures
 * @property {MidiNote[]} notes - In order of their start
 * @property {string[]} warnings - What was wrong with the file
 */

/** Notes read before the rest of a file is left out. */
export const MAX_NOTES = 200000;

/**
 * @param {Uint8Array} bytes
 * @param {number} at
 * @param {string} word - Four characters
 * @returns {boolean}
 */
function has(bytes, at, word) {
  return [...word].every((char, i) => bytes[at + i] === char.charCodeAt(0));
}

/** @type {(bytes: Uint8Array, at: number) => number} A big-endian 32-bit number. */
const u32 = (bytes, at) =>
  bytes[at] * 16777216 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];

/**
 * Read a MIDI file.
 * @param {Uint8Array|ArrayBuffer|number[]} data
 * @returns {Midi|null} null when there is no MIDI header in it
 */
export function parseMidi(data) {
  const usable = data instanceof Uint8Array || data instanceof ArrayBuffer || Array.isArray(data);
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(usable ? /** @type {any} */ (data) : 0);
  // The header may sit inside a wrapper (a RIFF file) or after stray bytes.
  let at = 0;
  while (at + 14 <= bytes.length && !has(bytes, at, 'MThd')) at++;
  if (at + 14 > bytes.length) return null;
  const headed = u32(bytes, at + 4);
  const format = (bytes[at + 8] << 8) | bytes[at + 9];
  const raw = (bytes[at + 12] << 8) | bytes[at + 13];
  /** @type {Midi} */
  const midi = {
    format,
    division: raw,
    tracks: [],
    tempos: [],
    signatures: [],
    notes: [],
    warnings: [],
  };
  if (raw & 0x8000 || raw === 0) {
    // Time-code timing: ticks per second, read as if at 120 beats a minute.
    const frames = 256 - (raw >> 8);
    midi.division = raw === 0 ? 480 : Math.max(1, Math.round((frames * (raw & 0xff)) / 2));
    midi.warnings.push('The file is timed in frames, not beats: read as 120 beats a minute');
  }
  if (format > 1) midi.warnings.push(`Format ${format} is read as separate tracks`);
  at += 8 + Math.max(6, headed);
  while (at + 8 <= bytes.length && midi.notes.length < MAX_NOTES) {
    const length = u32(bytes, at + 4);
    const end = Math.min(bytes.length, at + 8 + length);
    if (has(bytes, at, 'MTrk')) {
      if (at + 8 + length > bytes.length) midi.warnings.push('The last track is cut short');
      readTrack(bytes, at + 8, end, midi);
    }
    at = end;
  }
  if (midi.notes.length >= MAX_NOTES)
    midi.warnings.push(`Only the first ${MAX_NOTES} notes are read`);
  midi.notes.sort((a, b) => a.tick - b.tick || a.track - b.track || a.pitch - b.pitch);
  midi.tempos.sort((a, b) => a.tick - b.tick);
  midi.signatures.sort((a, b) => a.tick - b.tick);
  return midi;
}
