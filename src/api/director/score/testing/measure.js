/**
 * Measuring a rendered score, for tests and for tuning the styles: nobody
 * listens to a test run, so the sound is judged by numbers — programme
 * loudness and true peak as FFmpeg's EBU R 128 meter reads them, and the
 * level and brightness of any stretch of the song. Not part of the runtime API.
 * @module api/director/score/testing/measure
 */

import { closeSync, openSync, writeSync } from 'node:fs';
import { createRenderer } from '#utils/music/engine/renderer.js';
import { spectrum } from '#utils/music/engine/testkitSpectrum.js';
import { pcm16, wavHeader } from '#utils/music/wav.js';
import { run } from '../../../lib/ffmpeg.js';

const RATE = 48000;
/** Samples of one spectrum, and the seconds between two of them. */
const WINDOW = 16384;
const HOP = 0.25;

/**
 * Render a song to a WAV file, as the server's renderer writes it.
 * @param {any} song
 * @param {string} file
 * @returns {Float64Array} The sound as one channel (left + right, halved)
 */
export function renderToWav(song, file) {
  const renderer = createRenderer(song);
  const mono = new Float64Array(renderer.frames);
  const fd = openSync(file, 'w');
  writeSync(fd, wavHeader(renderer.frames, renderer.sampleRate));
  let at = 0;
  for (let chunk = renderer.render(RATE); chunk.length; chunk = renderer.render(RATE)) {
    writeSync(fd, pcm16(chunk));
    for (let i = 0; i < chunk.length; i += 2) mono[at++] = (chunk[i] + chunk[i + 1]) / 2;
  }
  closeSync(fd);
  return mono;
}

/**
 * Programme loudness of a sound file (EBU R 128, by FFmpeg's `ebur128`).
 * @param {string} file
 * @returns {Promise<{ lufs: number, range: number, peak: number }>} Integrated
 *   loudness (LUFS), loudness range (LU) and true peak (dBFS)
 */
export async function loudness(file) {
  const filter = 'ebur128=peak=true:framelog=quiet';
  const args = ['-hide_banner', '-nostats', '-i', file, '-af', filter, '-f', 'null', '-'];
  const { stderr } = await run('ffmpeg', args, { maxStderr: 1 << 20 });
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const read = (/** @type {RegExp} */ pattern) => Number(pattern.exec(summary)?.[1]);
  return {
    lufs: read(/I:\s+(-?[\d.]+) LUFS/),
    range: read(/LRA:\s+(-?[\d.]+) LU/),
    peak: read(/Peak:\s+(-?[\d.]+) dBFS/),
  };
}

/** @type {(value: number) => number} A level in decibels. */
export const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));

/**
 * @param {ArrayLike<number>} signal
 * @param {number} from - Seconds
 * @param {number} to
 * @returns {{ rms: number, peak: number }} Decibels re full scale
 */
export function level(signal, from, to) {
  const start = Math.max(0, Math.round(from * RATE));
  const end = Math.min(signal.length, Math.round(to * RATE));
  let [sum, peak] = [0, 0];
  for (let i = start; i < end; i++) {
    sum += signal[i] * signal[i];
    peak = Math.max(peak, Math.abs(signal[i]));
  }
  return { rms: db(Math.sqrt(sum / Math.max(1, end - start))), peak: db(peak) };
}

/**
 * How bright a stretch is: its spectral centroid — over magnitudes, so that
 * a kick drum does not outweigh everything above it — and the level of
 * what lies above 2 kHz, where hats, shakers and the bite of a lead are.
 * @param {ArrayLike<number>} signal
 * @param {number} from - Seconds
 * @param {number} to
 * @returns {{ centroid: number, highs: number }} Hz, and decibels re full scale
 */
export function brightness(signal, from, to) {
  const hertz = RATE / WINDOW;
  let [centroid, share, count] = [0, 0, 0];
  for (let at = from; at + WINDOW / RATE <= to; at += HOP) {
    let [weighted, total, energy, high] = [0, 0, 0, 0];
    spectrum(signal, at, WINDOW).forEach((magnitude, bin) => {
      weighted += magnitude * bin;
      total += magnitude;
      energy += magnitude * magnitude;
      if (bin * hertz >= 2000) high += magnitude * magnitude;
    });
    centroid += total ? (weighted / total) * hertz : 0;
    share += energy ? high / energy : 0;
    count++;
  }
  if (!count) return { centroid: 0, highs: -120 };
  const all = level(signal, from, to).rms;
  return { centroid: centroid / count, highs: all + 10 * Math.log10(Math.max(1e-12, share / count)) };
}
