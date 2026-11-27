/**
 * Streaming onset-strength envelope (log-compressed, band-grouped spectral
 * flux). Feed PCM chunks of any size; memory use is one float per hop, so an
 * hour of audio costs a few megabytes rather than the decoded waveform.
 * @module api/intelligence/dsp/onset
 */

import { createFft } from './fft.js';

export const ONSET_DEFAULTS = { sampleRate: 22050, frameSize: 1024, hop: 256, bands: 32 };
const COMPRESSION = 1000; // log(1 + C·E): the knee sits near -60 dBFS

/**
 * @typedef {Object} OnsetResult
 * @property {Float32Array} flux - Raw onset strength, one value per hop
 * @property {number} frameRate - Envelope frames per second
 * @property {number} sampleRate
 * @property {number} hop
 * @property {number} rms - RMS level of the whole signal (0..1)
 * @property {number} duration - Seconds of audio consumed
 */

/**
 * Create a streaming detector. Frame `n` ends at sample `(n + 1) * hop`: the
 * stream is primed with silence so the very first samples are analysed too.
 * @param {Partial<typeof ONSET_DEFAULTS>} [options]
 * @returns {{ push: (samples: Float32Array) => void, finish: () => OnsetResult }}
 */
export function createOnsetDetector(options = {}) {
  const { sampleRate, frameSize, hop, bands } = { ...ONSET_DEFAULTS, ...options };
  const fft = createFft(frameSize);
  const half = frameSize >> 1;
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameSize)) / (frameSize / 4);
  }
  // Quasi-logarithmic bands: bin k (1..half) → band index. DC is ignored.
  const bandOf = new Uint16Array(half + 1);
  for (let k = 1; k <= half; k++) {
    bandOf[k] = Math.min(bands - 1, Math.floor((bands * Math.log(k)) / Math.log(half)));
  }
  const buffer = new Float32Array(frameSize);
  const frame = new Float32Array(frameSize);
  const mags = new Float32Array(half + 1);
  const energy = new Float64Array(bands);
  const previous = new Float64Array(bands);
  /** @type {number[]} */
  const flux = [];
  let filled = frameSize - hop; // primed with zeros
  let sumSquares = 0;
  let total = 0;

  /** Analyse the full buffer and append one flux value. */
  function analyse() {
    for (let i = 0; i < frameSize; i++) frame[i] = buffer[i] * window[i];
    fft.magnitudes(frame, mags);
    energy.fill(0);
    for (let k = 1; k <= half; k++) energy[bandOf[k]] += mags[k];
    let rise = 0;
    for (let b = 0; b < bands; b++) {
      const level = Math.log(1 + COMPRESSION * energy[b]);
      if (level > previous[b]) rise += level - previous[b];
      previous[b] = level;
    }
    flux.push(rise);
  }

  /** @param {Float32Array} samples - Mono PCM in -1..1 */
  function push(samples) {
    for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
    total += samples.length;
    let offset = 0;
    while (offset < samples.length) {
      const n = Math.min(frameSize - filled, samples.length - offset);
      buffer.set(samples.subarray(offset, offset + n), filled);
      filled += n;
      offset += n;
      if (filled === frameSize) {
        analyse();
        buffer.copyWithin(0, hop);
        filled = frameSize - hop;
      }
    }
  }

  /** @returns {OnsetResult} */
  function finish() {
    return {
      flux: Float32Array.from(flux),
      frameRate: sampleRate / hop,
      sampleRate,
      hop,
      rms: total ? Math.sqrt(sumSquares / total) : 0,
      duration: total / sampleRate,
    };
  }

  return { push, finish };
}

/**
 * Turn raw flux into a peak-picking friendly envelope: subtract the local
 * mean (±0.5 s), keep the positive part, scale to unit standard deviation.
 * @param {Float32Array} flux
 * @param {number} frameRate
 * @returns {Float32Array|null} null when the signal has no variation at all
 */
export function normalizeEnvelope(flux, frameRate) {
  const n = flux.length;
  const reach = Math.max(1, Math.round(frameRate * 0.5));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + flux[i];
  const out = new Float32Array(n);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - reach);
    const hi = Math.min(n, i + reach + 1);
    const value = Math.max(0, flux[i] - (prefix[hi] - prefix[lo]) / (hi - lo));
    out[i] = value;
    sum += value;
    sumSq += value * value;
  }
  const variance = n ? sumSq / n - (sum / n) ** 2 : 0;
  if (!(variance > 1e-9)) return null;
  const scale = 1 / Math.sqrt(variance);
  for (let i = 0; i < n; i++) out[i] *= scale;
  return out;
}
