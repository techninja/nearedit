/**
 * Deterministic randomness for generators and effects. Nothing here keeps
 * state between frames: a value is a pure function of a seed and of the
 * keys that name what is being randomised (a particle index, a grid cell, a
 * property), so any frame can be drawn on its own and comes out the same in
 * the browser and on the server. Never use `Math.random` in a generator.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § Determinism.
 * @module utils/compose/random
 */

const { floor, imul } = Math;
const UINT = 4294967296;

/**
 * Scramble a 32-bit integer (the finaliser of MurmurHash3).
 * @param {number} h
 * @returns {number} Unsigned 32-bit integer
 */
function mix(h) {
  h = imul(h ^ (h >>> 16), 0x85ebca6b);
  h = imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Hash a seed and up to three integer keys into an unsigned 32-bit integer.
 * Keys are truncated to integers; use distinct keys for distinct properties
 * of one thing (`hash(seed, particle, 0)` for x, `hash(seed, particle, 1)`
 * for y).
 * @param {number} seed
 * @param {number} [a=0]
 * @param {number} [b=0]
 * @param {number} [c=0]
 * @returns {number}
 */
export function hash(seed, a = 0, b = 0, c = 0) {
  let h = mix((seed | 0) ^ 0x9e3779b9);
  h = mix(h ^ imul(a | 0, 0x27d4eb2f));
  h = mix(h ^ imul(b | 0, 0x165667b1));
  return mix(h ^ imul(c | 0, 0x9e3779b1));
}

/**
 * A uniform random number in [0, 1) for a seed and keys — the same value
 * every time it is asked for.
 * @param {number} seed
 * @param {number} [a=0]
 * @param {number} [b=0]
 * @param {number} [c=0]
 * @returns {number}
 */
export const rand = (seed, a = 0, b = 0, c = 0) => hash(seed, a, b, c) / UINT;

/**
 * A uniform random number in [min, max) for a seed and keys.
 * @param {number} min
 * @param {number} max
 * @param {number} seed
 * @param {number} [a=0]
 * @param {number} [b=0]
 * @param {number} [c=0]
 * @returns {number}
 */
export const randRange = (min, max, seed, a = 0, b = 0, c = 0) =>
  min + (max - min) * rand(seed, a, b, c);

/**
 * Turn a document seed (any number, or a string) into a 32-bit integer.
 * @param {unknown} value
 * @returns {number}
 */
export function seedOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return mix(floor(value) | 0);
  let h = 0x811c9dc5;
  for (const ch of String(value ?? '')) h = imul(h ^ ch.codePointAt(0), 0x01000193);
  return mix(h);
}

/**
 * A sequence of random numbers from one seed (mulberry32), for code that
 * draws many values in a fixed order. Create it inside `draw`, every frame.
 * @param {number} seed
 * @returns {{ next: () => number, range: (min: number, max: number) => number,
 *   int: (n: number) => number }} `next` is in [0, 1); `int(n)` in 0..n-1
 */
export function createRandom(seed) {
  let state = seedOf(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = imul(state ^ (state >>> 15), 1 | state);
    t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT;
  };
  return { next, range: (min, max) => min + (max - min) * next(), int: (n) => floor(next() * n) };
}

/** @param {number} t @returns {number} Smoothstep fade for lattice noise */
const fade = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Smooth 2D value noise: random values on the integer lattice, blended between.
 * @param {number} x
 * @param {number} y
 * @param {number} [seed=0]
 * @returns {number} 0..1
 */
export function noise2(x, y, seed = 0) {
  const xi = floor(x);
  const yi = floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const top = lerp(rand(seed, xi, yi), rand(seed, xi + 1, yi), u);
  const bottom = lerp(rand(seed, xi, yi + 1), rand(seed, xi + 1, yi + 1), u);
  return lerp(top, bottom, v);
}

/**
 * Smooth 3D value noise — make the third axis time and the field evolves.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [seed=0]
 * @returns {number} 0..1
 */
export function noise3(x, y, z, seed = 0) {
  const zi = floor(z);
  const w = fade(z - zi);
  return lerp(noise2(x, y, hash(seed, zi)), noise2(x, y, hash(seed, zi + 1)), w);
}

/**
 * Fractal noise: octaves of `noise3` at doubling frequency, halving weight.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [seed=0]
 * @param {number} [octaves=4]
 * @returns {number} 0..1
 */
export function fractal(x, y, z, seed = 0, octaves = 4) {
  let sum = 0;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = 2 ** o;
    sum += noise3(x * f, y * f, z * f, hash(seed, o, 77)) / f;
    total += 1 / f;
  }
  return total > 0 ? sum / total : 0;
}
