/**
 * The bytes of a Standard MIDI File: numbers of variable length, chunks,
 * tracks from events. Isomorphic and pure.
 * @module utils/music/midi/write
 */

/**
 * @param {number} value
 * @returns {number[]} The number as a MIDI variable-length quantity
 */
export function variable(value) {
  const bytes = [value & 0x7f];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) {
    bytes.unshift((rest & 0x7f) | 0x80);
  }
  return bytes;
}

/** @type {(value: number) => number[]} A big-endian 32-bit number. */
export const u32 = (value) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
/** @type {(word: string) => number[]} The bytes of a text, 7 bits each. */
export const text = (word) => [...word].map((char) => char.charCodeAt(0) & 0x7f);

/**
 * A track chunk from events at absolute ticks.
 * @param {{ tick: number, bytes: number[] }[]} events - In the order they
 *   should be written when ticks are equal
 * @returns {number[]}
 */
export function track(events) {
  const sorted = events.map((event, order) => ({ ...event, order }));
  sorted.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body = [];
  let last = 0;
  for (const event of sorted) {
    body.push(...variable(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return [...text('MTrk'), ...u32(body.length), ...body];
}

/**
 * @param {string} name
 * @returns {{ tick: number, bytes: number[] }} A track-name event
 */
export function named(name) {
  const letters = text(name.slice(0, 100));
  return { tick: 0, bytes: [0xff, 0x03, ...variable(letters.length), ...letters] };
}
