/**
 * Waveform peaks — the loudest sample in each of a series of equal windows.
 * ffmpeg decodes the audio to mono PCM on a pipe and the peaks are reduced
 * as the samples stream past, so memory stays flat however long the file is
 * and nothing is written to disk.
 * @module api/previews/peaks
 */

import { run } from '../lib/ffmpeg.js';

export const PEAK_SAMPLE_RATE = 44100;
/** Upper bound on the number of peaks returned for one file. */
export const MAX_PEAKS = 100_000;
const BYTES_PER_SAMPLE = 2;
/** A stalled decode (a dead network mount, say) must not hold a job slot forever. */
const DECODE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Choose the window size: finer for short clips, coarser for long ones so a
 * feature-length file still fits in MAX_PEAKS.
 * @param {number} duration - Seconds (0 when unknown)
 * @returns {number} PCM samples per peak
 */
export function peakWindow(duration) {
  const preferred = duration < 30 ? 100 : duration < 300 ? 50 : 30; // peaks per second
  const affordable = duration > 0 ? MAX_PEAKS / duration : preferred;
  return Math.max(1, Math.ceil(PEAK_SAMPLE_RATE / Math.min(preferred, affordable)));
}

/**
 * Reduce a PCM stream to peaks. Feed it chunks in order, then call `finish`.
 * @param {number} window - PCM samples per peak
 * @returns {{ push: (chunk: Buffer) => void, finish: () => number[], samples: () => number }}
 */
export function createPeakReducer(window) {
  /** @type {number[]} */
  const peaks = [];
  /** @type {Buffer|null} A trailing odd byte waiting for its other half */
  let carry = null;
  let max = 0;
  let filled = 0;
  let total = 0;

  const close = () => {
    peaks.push(Math.round((max / 32768) * 1000) / 1000);
    max = 0;
    filled = 0;
  };

  return {
    push(chunk) {
      const data = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = data.length - (data.length % BYTES_PER_SAMPLE);
      for (let offset = 0; offset < usable; offset += BYTES_PER_SAMPLE) {
        const level = Math.abs(data.readInt16LE(offset));
        if (level > max) max = level;
        if (++filled === window) close();
      }
      total += usable / BYTES_PER_SAMPLE;
      carry = usable < data.length ? data.subarray(usable) : null;
    },
    finish() {
      if (filled > 0) close();
      return peaks;
    },
    samples: () => total,
  };
}

/**
 * Compute the waveform peaks of an audio (or audio-bearing video) file.
 * @param {string} source - File to decode
 * @param {{ duration?: number, signal?: AbortSignal, onProgress?: (fraction: number) => void }} [opts]
 *   `duration` is only an estimate used to size the windows and report progress
 * @returns {Promise<{ peaks: number[], samples: number, duration: number, peaksPerSecond: number }>}
 *   `duration` is the decoded length; peak `i` covers the time `i / peaksPerSecond`
 */
export async function computePeaks(source, opts = {}) {
  const { duration = 0, signal, onProgress } = opts;
  const window = peakWindow(duration);
  const reducer = createPeakReducer(window);
  let reported = 0;

  const input = ['-v', 'error', '-nostdin', '-i', source, '-map', '0:a:0', '-vn'];
  const output = ['-ac', '1', '-ar', String(PEAK_SAMPLE_RATE), '-f', 's16le', 'pipe:1'];
  await run('ffmpeg', [...input, ...output], {
    signal,
    timeout: DECODE_TIMEOUT_MS,
    onStdout: (chunk) => {
      reducer.push(chunk);
      const fraction = duration > 0 ? reducer.samples() / PEAK_SAMPLE_RATE / duration : 0;
      if (onProgress && fraction - reported >= 0.05) {
        reported = fraction;
        onProgress(Math.min(1, fraction));
      }
    },
  });

  const peaks = reducer.finish();
  return {
    peaks,
    samples: peaks.length,
    duration: reducer.samples() / PEAK_SAMPLE_RATE,
    peaksPerSecond: PEAK_SAMPLE_RATE / window,
  };
}
