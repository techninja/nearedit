/**
 * The engine's own arithmetic. A song must give the same samples in every
 * JavaScript runtime, and the language only promises exact results for
 * `+ − × ÷`, `Math.sqrt` and the rounding functions; `Math.sin`, `exp`,
 * `pow` and `tanh` may differ in the last bit from one engine or version to
 * the next. So everything curved that reaches a sample is computed here from
 * exact operations alone. Isomorphic and pure.
 * @module utils/music/engine/math
 */

const TAU = 2 * Math.PI;
const TAU2 = TAU * TAU;
// Taylor coefficients of sin(2πx): ±(2π)^n / n!
const S1 = TAU;
const S3 = (-S1 * TAU2) / 6;
const S5 = (-S3 * TAU2) / 20;
const S7 = (-S5 * TAU2) / 42;
const S9 = (-S7 * TAU2) / 72;
const S11 = (-S9 * TAU2) / 110;
const LN2 = 0.6931471805599453;
/** 1 / n! for n = 0 … 10. */
const INVERSE_FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800].map((n) => 1 / n);

/**
 * The sine of a phase given in turns.
 * @param {number} phase - 0 ≤ phase < 1
 * @returns {number} `sin(2π · phase)`, within 6e-8
 */
export function sinTurn(phase) {
  const x = phase < 0.25 ? phase : phase < 0.75 ? 0.5 - phase : phase - 1;
  const z = x * x;
  return x * (S1 + z * (S3 + z * (S5 + z * (S7 + z * (S9 + z * S11)))));
}

/**
 * The sine of any angle in turns.
 * @param {number} turns
 * @returns {number}
 */
export function sinOf(turns) {
  return sinTurn(turns - Math.floor(turns));
}

/**
 * `tan(π · f)` for a frequency as a share of the sample rate — the warped
 * frequency of a trapezoidal filter.
 * @param {number} share - Frequency ÷ sample rate, 0 … 0.49
 * @returns {number}
 */
export function tanHalf(share) {
  const turns = share / 2;
  return sinTurn(turns) / sinTurn(turns + 0.25);
}

/**
 * @param {number} x
 * @returns {number} e to the x
 */
export function exp(x) {
  if (!(x > -700)) return 0;
  const k = Math.round((x > 700 ? 700 : x) / LN2);
  const r = (x > 700 ? 700 : x) - k * LN2;
  let series = 1 / 39916800;
  for (let n = 10; n > 0; n--) series = series * r + INVERSE_FACTORIAL[n];
  let scale = 1;
  const twice = k < 0 ? 0.5 : 2;
  for (let i = k < 0 ? -k : k; i > 0; i--) scale *= twice;
  return (series * r + 1) * scale;
}

/**
 * @param {number} x
 * @returns {number} 2 to the x
 */
export function pow2(x) {
  return exp(x * LN2);
}

/**
 * @param {number} note - MIDI note number, fractions allowed
 * @returns {number} Its frequency in Hz (A4 = 69 = 440 Hz)
 */
export function noteHz(note) {
  return 440 * pow2((note - 69) / 12);
}

/**
 * @param {number} decibels
 * @returns {number} The gain that many dB up or down
 */
export function dbGain(decibels) {
  return exp(decibels * 0.11512925464970229);
}

/**
 * What a level is multiplied by every sample to fall 60 dB in a time.
 * @param {number} seconds - Time to fall to a thousandth
 * @param {number} sampleRate
 * @returns {number} 0 for a time of 0
 */
export function decayPerSample(seconds, sampleRate) {
  return seconds > 0 ? exp(-6.907755278982137 / (seconds * sampleRate)) : 0;
}

/**
 * A soft clip with the shape of tanh: straight through the middle, flat at
 * ±1 from |x| = 3 on, smooth everywhere.
 * @param {number} x
 * @returns {number} −1 … 1
 */
export function softClip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const z = x * x;
  return (x * (27 + z)) / (27 + 9 * z);
}

/**
 * One step of a 32-bit xorshift generator: the engine's only source of
 * noise, so every hiss and every "random" phase is the same in every run.
 * @param {number} state - A non-zero 32-bit integer
 * @returns {number} The next state; `state * 2 ** -31` is a sample in −1 … 1
 */
export function xorshift(state) {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

/** Multiply an xorshift state by this for a sample in −1 … 1. */
export const NOISE_SCALE = 1 / 2147483648;

/**
 * A well-mixed, non-zero 32-bit seed from a few small integers.
 * @param {number} a
 * @param {number} b
 * @param {number} [c]
 * @returns {number}
 */
export function seedOf(a, b, c = 0) {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15) ^ Math.imul(c + 1, 0xc2b2ae35), 0x27d4eb2f);
  h ^= h >>> 13;
  return h | 0 || 0x1234567;
}
