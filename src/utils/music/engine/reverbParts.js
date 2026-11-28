/**
 * Building blocks of the reverb: delay lines read and written a run at a
 * time, the all-pass that blurs its input, the matrix that mixes its lines,
 * and prime line lengths. A run is never longer than the delay it passes
 * through, so nothing in a run depends on anything else in it. Isomorphic;
 * no state outside the lines.
 * @module utils/music/engine/reverbParts
 */

/** How much an all-pass feeds back and forward. */
const DIFFUSION = 0.6;

/**
 * @param {number} n
 * @returns {number} The first prime at or above n
 */
export function primeFrom(n) {
  for (let p = Math.max(2, Math.round(n)); ; p++) {
    let prime = true;
    for (let d = 2; d * d <= p && prime; d++) prime = p % d !== 0;
    if (prime) return p;
  }
}

/**
 * A delay line: what is written comes out `length` samples later.
 * @typedef {{ memory: Float64Array, at: number }} Line
 */

/**
 * @param {number} length - Samples
 * @returns {Line}
 */
export function line(length) {
  return { memory: new Float64Array(length), at: 0 };
}

/**
 * Copy what comes out of a line next.
 * @param {Line} from
 * @param {Float64Array} out
 * @param {number} count - At most the line's length
 */
export function tap(from, out, count) {
  const { memory, at } = from;
  const first = Math.min(count, memory.length - at);
  for (let i = 0; i < first; i++) out[i] = memory[at + i];
  for (let i = first; i < count; i++) out[i] = memory[i - first];
}

/**
 * Write the next samples into a line and move it on.
 * @param {Line} to
 * @param {Float64Array} samples
 * @param {number} count - At most the line's length
 */
export function feed(to, samples, count) {
  const { memory, at } = to;
  const first = Math.min(count, memory.length - at);
  for (let i = 0; i < first; i++) memory[at + i] = samples[i];
  for (let i = first; i < count; i++) memory[i - first] = samples[i];
  to.at = (at + count) % memory.length;
}

/**
 * An all-pass filter over a run, in place: every frequency passes at full
 * level, but smeared over time.
 * @param {Line} pad
 * @param {Float64Array} samples
 * @param {Float64Array} scratch
 * @param {number} count - At most the line's length
 */
export function diffuse(pad, samples, scratch, count) {
  tap(pad, scratch, count);
  for (let i = 0; i < count; i++) {
    const delayed = scratch[i];
    const fed = samples[i] + delayed * DIFFUSION;
    scratch[i] = fed;
    samples[i] = delayed - fed * DIFFUSION;
  }
  feed(pad, scratch, count);
}

/**
 * Mix eight runs so that each ends up in all eight, in place: a Hadamard
 * transform, scaled so that the energy stays what it was.
 * @param {Float64Array[]} runs - Eight of them
 * @param {number} count
 */
export function hadamard(runs, count) {
  const [r0, r1, r2, r3, r4, r5, r6, r7] = runs;
  const scale = 0.35355339059327373; // 1 / √8
  for (let i = 0; i < count; i++) {
    const a0 = r0[i] + r1[i];
    const a1 = r0[i] - r1[i];
    const a2 = r2[i] + r3[i];
    const a3 = r2[i] - r3[i];
    const a4 = r4[i] + r5[i];
    const a5 = r4[i] - r5[i];
    const a6 = r6[i] + r7[i];
    const a7 = r6[i] - r7[i];
    const b0 = a0 + a2;
    const b1 = a1 + a3;
    const b2 = a0 - a2;
    const b3 = a1 - a3;
    const b4 = a4 + a6;
    const b5 = a5 + a7;
    const b6 = a4 - a6;
    const b7 = a5 - a7;
    r0[i] = (b0 + b4) * scale;
    r1[i] = (b1 + b5) * scale;
    r2[i] = (b2 + b6) * scale;
    r3[i] = (b3 + b7) * scale;
    r4[i] = (b0 - b4) * scale;
    r5[i] = (b1 - b5) * scale;
    r6[i] = (b2 - b6) * scale;
    r7[i] = (b3 - b7) * scale;
  }
}
