/**
 * Silence step — FFmpeg `silencedetect` over the audio track. The director
 * uses the result to tighten clips when there is no word-level transcript.
 * @module api/intelligence/steps/silence
 */

import { progressLines, round3 } from './types.js';

/** @typedef {import('./types.js').Step} Step */

// -30 dB / 0.4 s marks the pauses between sentences in ordinary speech
// recordings (FFmpeg's own -60 dB default only finds digital silence).
export const SILENCE_DEFAULTS = { noiseDb: -30, minDuration: 0.4 };

/**
 * Turn silencedetect log lines into ranges. A silence still open at the end
 * of the file is closed at `duration`.
 * @param {string[]} lines - FFmpeg stderr lines
 * @param {number|null} [duration]
 * @returns {{ start: number, end: number }[]}
 */
export function parseSilences(lines, duration = null) {
  const silences = [];
  let open = null;
  for (const line of lines) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) open = Math.max(0, Number(start[1]));
    const end = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (end && open !== null) {
      silences.push({ start: round3(open), end: round3(Number(end[1])) });
      open = null;
    }
  }
  if (open !== null && duration && duration > open) {
    silences.push({ start: round3(open), end: round3(duration) });
  }
  return silences.filter((s) => s.end > s.start);
}

/**
 * Audio is assumed present until a probe says otherwise.
 * @param {import('./types.js').MediaType} type
 * @param {import('./types.js').Sidecar|null} sidecar
 * @returns {string}
 */
export function needsAudio(type, sidecar) {
  if (type !== 'audio' && type !== 'video') return `not applicable to ${type} files`;
  return sidecar?.hasAudio === false ? 'no audio stream' : '';
}

/** @type {Step} */
export const silenceStep = {
  name: 'silence',
  jobType: 'silence',
  unsuitable: needsAudio,

  done(sidecar, options) {
    if (!Array.isArray(sidecar?.silences)) return false;
    const { noiseDb, minDuration } = options;
    if (noiseDb !== undefined && noiseDb !== sidecar.silenceNoiseDb) return false;
    return minDuration === undefined || minDuration === sidecar.silenceMinDuration;
  },

  async run(filePath, ctx) {
    const noiseDb = ctx.options.noiseDb ?? SILENCE_DEFAULTS.noiseDb;
    const minDuration = ctx.options.minDuration ?? SILENCE_DEFAULTS.minDuration;
    const duration = ctx.sidecar?.duration ?? null;
    const lines = [];
    const onProgress = progressLines(duration, ctx.progress);
    const args = ['-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:2', '-i', filePath];
    args.push('-vn', '-sn', '-dn', '-af', `silencedetect=noise=${noiseDb}dB:d=${minDuration}`);
    args.push('-f', 'null', '-');
    await ctx.deps.run('ffmpeg', args, {
      signal: ctx.signal,
      onStderr: (line) => {
        if (line.includes('silence_')) lines.push(line);
        else onProgress(line);
      },
    });
    return {
      silences: parseSilences(lines, duration),
      silenceNoiseDb: noiseDb,
      silenceMinDuration: minDuration,
    };
  },

  summary: (patch) => ({ silences: patch.silences.length }),
};
