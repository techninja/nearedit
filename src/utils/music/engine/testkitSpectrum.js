/**
 * Measuring where the energy of a sound sits, for tests: its spectrum, how
 * bright it is, what pitch it has. Not part of the runtime API — import it
 * from tests.
 * @module utils/music/engine/testkitSpectrum
 */

import { RATE } from './testkit.js';

/**
 * The magnitude spectrum of a stretch of signal (Hann window, radix-2 FFT).
 * @param {ArrayLike<number>} signal
 * @param {number} from - Seconds
 * @param {number} [size=16384] - Samples, a power of two
 * @returns {Float64Array} `size / 2` magnitudes; bin `i` is `i × RATE / size` Hz
 */
export function spectrum(signal, from, size = 16384) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const start = Math.round(from * RATE);
  for (let i = 0; i < size; i++) {
    re[i] = (signal[start + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let span = 2; span <= size; span *= 2) {
    for (let i = 0; i < size; i += span) {
      for (let k = 0; k < span / 2; k++) {
        const angle = (-2 * Math.PI * k) / span;
        const [a, b] = [i + k, i + k + span / 2];
        const xr = re[b] * Math.cos(angle) - im[b] * Math.sin(angle);
        const xi = re[b] * Math.sin(angle) + im[b] * Math.cos(angle);
        [re[b], im[b]] = [re[a] - xr, im[a] - xi];
        [re[a], im[a]] = [re[a] + xr, im[a] + xi];
      }
    }
  }
  return Float64Array.from({ length: size / 2 }, (_, i) => Math.hypot(re[i], im[i]));
}

/**
 * @param {Float64Array} magnitudes - From `spectrum`
 * @param {number} low - Hz
 * @param {number} high
 * @returns {number} The share of the energy that lies between two frequencies, 0 … 1
 */
export function share(magnitudes, low, high) {
  const hertz = RATE / (2 * magnitudes.length);
  let [inside, all] = [0, 0];
  magnitudes.forEach((value, i) => {
    all += value * value;
    if (i * hertz >= low && i * hertz < high) inside += value * value;
  });
  return all ? inside / all : 0;
}

/**
 * @param {Float64Array} magnitudes
 * @returns {number} The frequency the energy is centred on, Hz: higher = brighter
 */
export function centroid(magnitudes) {
  let [weighted, all] = [0, 0];
  magnitudes.forEach((value, i) => {
    weighted += value * value * i;
    all += value * value;
  });
  return all ? ((weighted / all) * RATE) / (2 * magnitudes.length) : 0;
}

/**
 * The pitch of a steady tone, by the lag at which it best matches itself.
 * @param {ArrayLike<number>} signal
 * @param {number} from - Seconds
 * @param {number} near - Hz it is expected around (within a fifth)
 * @returns {number} Hz
 */
export function pitch(signal, from, near) {
  const start = Math.round(from * RATE);
  const size = Math.min(signal.length - start, Math.round((RATE / near) * 24));
  const match = (lag) => {
    let sum = 0;
    for (let i = 0; i + lag < size; i++) sum += signal[start + i] * signal[start + i + lag];
    return sum / (size - lag);
  };
  let best = Math.round(RATE / near);
  for (let lag = Math.floor(RATE / near / 1.4); lag <= Math.ceil((RATE / near) * 1.4); lag++) {
    if (match(lag) > match(best)) best = lag;
  }
  const [a, b, c] = [match(best - 1), match(best), match(best + 1)];
  return RATE / (best + (a - c) / (2 * (a - 2 * b + c) || 1));
}

/** @type {(hertz: number, wanted: number) => number} How far off a pitch is, in cents. */
export const cents = (hertz, wanted) => 1200 * Math.log2(hertz / wanted);

/**
 * The frequency of the strongest partial near a frequency, between bins.
 * @param {Float64Array} magnitudes
 * @param {number} near - Hz; looked for within a semitone of it
 * @returns {number} Hz
 */
export function partial(magnitudes, near) {
  const hertz = RATE / (2 * magnitudes.length);
  let best = Math.round(near / hertz);
  for (let i = Math.floor(near / 1.06 / hertz); i <= Math.ceil((near * 1.06) / hertz); i++) {
    if (magnitudes[i] > magnitudes[best]) best = i;
  }
  const [a, b, c] = [best - 1, best, best + 1].map((i) => Math.log(magnitudes[i] + 1e-30));
  return (best + (a - c) / (2 * (a - 2 * b + c) || 1)) * hertz;
}
