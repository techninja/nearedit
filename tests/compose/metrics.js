/**
 * Pixel comparison for the compositor tests: how far apart two renders of
 * the same frame are.
 * @module tests/compose/metrics
 */

/** Side of the squares `blockMax` averages over, pixels. */
export const BLOCK = 8;

/**
 * @typedef {Object} Difference
 * @property {number} max - Largest difference of any channel of any pixel, levels (0..255)
 * @property {number} mean - Mean absolute difference over all colour channels
 * @property {number} blockMax - Largest mean difference of any 8×8 block:
 *   small for differences confined to the edges of glyphs, large as soon as
 *   something is misplaced, missing or the wrong weight
 * @property {number} over2 - Channels that differ by more than 2 levels
 */

/**
 * Compare two RGBA buffers of one size. Alpha is ignored: frames are opaque.
 * @param {Uint8ClampedArray|Uint8Array} a
 * @param {Uint8ClampedArray|Uint8Array} b
 * @param {number} width
 * @param {number} height
 * @returns {Difference}
 */
export function difference(a, b, width, height) {
  if (a.length !== b.length || a.length !== width * height * 4) {
    throw new Error(`cannot compare buffers of ${a.length} and ${b.length} bytes`);
  }
  const cols = Math.ceil(width / BLOCK);
  const blocks = new Float64Array(cols * Math.ceil(height / BLOCK));
  const counts = new Uint32Array(blocks.length);
  let max = 0;
  let sum = 0;
  let over2 = 0;
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / BLOCK) * cols;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const block = row + Math.floor(x / BLOCK);
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        if (d > max) max = d;
        if (d > 2) over2++;
        sum += d;
        blocks[block] += d;
      }
      counts[block] += 3;
    }
  }
  let blockMax = 0;
  for (let i = 0; i < blocks.length; i++) blockMax = Math.max(blockMax, blocks[i] / counts[i]);
  return { max, mean: sum / (width * height * 3), blockMax, over2 };
}

/**
 * One line for a report.
 * @param {string} name
 * @param {Difference} d
 * @returns {string}
 */
export function describe(name, d) {
  const n = (/** @type {number} */ v) => v.toFixed(3);
  return `${name.padEnd(26)} max ${String(d.max).padStart(3)}  mean ${n(d.mean)}  block ${n(d.blockMax)}  >2: ${d.over2}`;
}

/**
 * A picture of where two renders differ: the difference of each channel,
 * amplified.
 * @param {Uint8ClampedArray|Uint8Array} a
 * @param {Uint8ClampedArray|Uint8Array} b
 * @param {number} [gain=24]
 * @returns {Uint8ClampedArray} RGBA
 */
export function differenceImage(a, b, gain = 24) {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = Math.abs(a[i + c] - b[i + c]) * gain;
    out[i + 3] = 255;
  }
  return out;
}
