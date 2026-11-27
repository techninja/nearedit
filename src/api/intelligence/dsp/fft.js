/**
 * Minimal radix-2 FFT for real input frames (magnitude spectrum only).
 * Plain JS on typed arrays — fast enough for an hour of audio in seconds.
 * @module api/intelligence/dsp/fft
 */

/**
 * @typedef {Object} Fft
 * @property {number} size
 * @property {(frame: Float32Array|Float64Array, out: Float32Array) => Float32Array} magnitudes
 *   Writes |X[k]| for k = 0..size/2 into `out` and returns it.
 */

/**
 * Build a reusable FFT of a power-of-two size (tables are precomputed once).
 * @param {number} size
 * @returns {Fft}
 */
export function createFft(size) {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two');
  const half = size >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = -Math.sin((2 * Math.PI * i) / size);
  }
  const bits = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reversed[i] = r;
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);

  /**
   * @param {Float32Array|Float64Array} frame - `size` real samples
   * @param {Float32Array} out - At least size/2 + 1 long
   * @returns {Float32Array}
   */
  function magnitudes(frame, out) {
    for (let i = 0; i < size; i++) {
      re[reversed[i]] = frame[i];
      im[i] = 0;
    }
    for (let len = 2; len <= size; len <<= 1) {
      const step = size / len;
      const h = len >> 1;
      for (let start = 0; start < size; start += len) {
        for (let k = 0, t = 0; k < h; k++, t += step) {
          const a = start + k;
          const b = a + h;
          const xr = re[b] * cos[t] - im[b] * sin[t];
          const xi = re[b] * sin[t] + im[b] * cos[t];
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
    for (let k = 0; k <= half; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    return out;
  }

  return { size, magnitudes };
}
