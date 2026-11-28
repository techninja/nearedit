/**
 * Writing MIDI files by hand, for tests: byte by byte, so that what the
 * parser reads was not made by the code under test. Not part of the runtime
 * API — import it from tests.
 * @module utils/music/midi/testkit
 */

/**
 * @param {number} value
 * @returns {number[]} A variable-length quantity
 */
export function vlq(value) {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

/** @type {(n: number) => number[]} A big-endian 32-bit number. */
export const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** @type {(word: string) => number[]} The bytes of a text. */
export const text = (word) => [...word].map((c) => c.charCodeAt(0));

/**
 * @param {number[][]} events - Each `[delta, ...bytes]`
 * @returns {number[]} A track chunk
 */
export function track(events) {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]);
  return [...text('MTrk'), ...u32(body.length), ...body];
}

/**
 * @param {number} format
 * @param {number} division - Ticks per quarter note
 * @param {number[][]} tracks - Track chunks
 * @returns {Uint8Array} A file
 */
export function file(format, division, tracks) {
  const head = [0, format, 0, tracks.length, division >> 8, division & 255];
  return Uint8Array.from([...text('MThd'), ...u32(6), ...head, ...tracks.flat()]);
}

/** The event that ends a track. */
export const END = [0, 0xff, 0x2f, 0];

/**
 * @param {number} bpm
 * @returns {number[]} A tempo event at delta 0
 */
export function tempo(bpm) {
  const micros = Math.round(60000000 / bpm);
  return [0, 0xff, 0x51, 3, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255];
}
