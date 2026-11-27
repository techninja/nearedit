/**
 * Beats step — decodes the audio to mono PCM through FFmpeg, streams it into
 * the onset detector and runs tempo estimation + beat tracking in plain JS.
 * No model or external service is involved.
 * @module api/intelligence/steps/beats
 */

import { createOnsetDetector, ONSET_DEFAULTS } from '../dsp/onset.js';
import { detectBeats } from '../dsp/detectBeats.js';
import { readPcm } from '../dsp/pcmStream.js';
import { needsAudio } from './silence.js';

/** @typedef {import('./types.js').Step} Step */

/**
 * Detect beats in a media file.
 * @param {string} filePath
 * @param {{ signal?: AbortSignal, duration?: number|null, progress?: (fraction: number) => void,
 *   read?: typeof readPcm }} [options]
 * @returns {Promise<import('../dsp/detectBeats.js').BeatResult>}
 */
export async function analyzeBeats(filePath, options = {}) {
  const { signal, duration, progress, read = readPcm } = options;
  const detector = createOnsetDetector();
  const { sampleRate } = ONSET_DEFAULTS;
  const expected = duration > 0 ? duration * sampleRate : 0;
  let consumed = 0;
  for await (const chunk of read(filePath, { sampleRate, signal })) {
    detector.push(chunk);
    consumed += chunk.length;
    if (expected && progress) progress(Math.min(1, consumed / expected));
  }
  return detectBeats(detector.finish());
}

/** @type {Step} */
export const beatsStep = {
  name: 'beats',
  jobType: 'beats',
  unsuitable: needsAudio,
  done: (sidecar) => Array.isArray(sidecar?.beats),

  async run(filePath, ctx) {
    const result = await analyzeBeats(filePath, {
      signal: ctx.signal,
      duration: ctx.sidecar?.duration,
      progress: ctx.progress,
    });
    return { beats: result.beats, bpm: result.bpm };
  },

  summary: (patch) => ({ beats: patch.beats.length, bpm: patch.bpm }),
};
