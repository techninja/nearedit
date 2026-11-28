/**
 * Seeded randomness for the helpers that write notes — the same seed always
 * gives the same line — and the note they all write. Only exact integer arithmetic, so it is the same in
 * every runtime. Isomorphic and pure.
 * @module utils/music/theory/random
 */

/**
 * @param {number} [seed=1]
 * @returns {() => number} Each call gives the next number in 0 … 1 (1 not
 *   included) of the sequence that seed stands for
 */
export function seeded(seed = 1) {
  let state = (Math.round(Number(seed) || 0) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} list
 * @returns {T} One of the list
 */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * One note, its numbers rounded so that sums of fractions read cleanly.
 * @param {number} beat
 * @param {number} length
 * @param {number} pitch
 * @param {number} velocity
 * @returns {number[]} `[beat, length, pitch, velocity]`
 */
export function note(beat, length, pitch, velocity) {
  const tidy = (value) => Math.round(value * 10000) / 10000;
  return [tidy(beat), tidy(length), Math.round(pitch), tidy(velocity)];
}
