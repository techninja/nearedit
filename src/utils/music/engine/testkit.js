/**
 * Measuring sound, for tests: nobody can listen to a test run, so what the
 * engine renders is checked by numbers — levels, pitch, where the energy
 * sits in the spectrum, how far one sample jumps from the last. Not part of
 * the runtime API — import it from tests.
 * @module utils/music/engine/testkit
 */

import { renderSong } from './renderer.js';

/** Sample rate the helpers assume. */
export const RATE = 48000;

/**
 * Render a song and split it into its two channels.
 * @param {any} song
 * @returns {{ left: Float64Array, right: Float64Array, mono: Float64Array, frames: number }}
 */
export function play(song) {
  const samples = renderSong(song);
  const frames = samples.length / 2;
  const [left, right, mono] = [0, 1, 2].map(() => new Float64Array(frames));
  for (let i = 0; i < frames; i++) {
    left[i] = samples[i * 2];
    right[i] = samples[i * 2 + 1];
    mono[i] = (left[i] + right[i]) / 2;
  }
  return { left, right, mono, frames };
}

/**
 * A song of one synth part at full volume, dry.
 * @param {string} preset
 * @param {number[][]} notes
 * @param {Record<string, any>} [more] - Fields of the part and, under `song`, of the song
 * @returns {any}
 */
export function solo(preset, notes, more = {}) {
  const { song, ...part } = more;
  const parts = [{ kind: 'synth', preset, volume: 1, notes, ...part }];
  return { bpm: 120, bars: 1, tail: 1, master: { volume: 1 }, ...song, parts };
}

/**
 * @param {ArrayLike<number>} signal
 * @param {number} [from] - Seconds
 * @param {number} [to]
 * @returns {{ peak: number, rms: number, mean: number, finite: boolean, jump: number }}
 *   `jump`: the largest step from one sample to the next
 */
export function level(signal, from = 0, to = signal.length / RATE) {
  const start = Math.max(0, Math.round(from * RATE));
  const end = Math.min(signal.length, Math.round(to * RATE));
  let [peak, sum, total, jump, finite] = [0, 0, 0, 0, true];
  for (let i = start; i < end; i++) {
    const x = signal[i];
    if (!Number.isFinite(x)) finite = false;
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
    total += x;
    if (i > start) jump = Math.max(jump, Math.abs(x - signal[i - 1]));
  }
  const count = Math.max(1, end - start);
  return { peak, rms: Math.sqrt(sum / count), mean: total / count, finite, jump };
}

/** @type {(value: number) => number} A level in decibels. */
export const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));

/**
 * @param {Float32Array} samples
 * @returns {string} A fingerprint of the exact bits (FNV-1a)
 */
export function hash(samples) {
  let h = 2166136261;
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
