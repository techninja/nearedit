/**
 * One transcript shape for every provider. faster-whisper nests words inside
 * segments, OpenAI-style servers return a flat `words` list, the legacy SSH
 * worker does either — all of it becomes `{ words, segments, language }`.
 * @module api/intelligence/transcription/normalize
 */

import { languageCode } from './languages.js';
import { round3 } from '../steps/types.js';

/**
 * @typedef {Object} Word
 * @property {string} word
 * @property {number} start - Seconds
 * @property {number} end
 * @property {number} [probability] - 0..1, absent when the provider gives none
 */
/**
 * @typedef {Object} Segment
 * @property {number} id
 * @property {number} start
 * @property {number} end
 * @property {string} text
 */
/**
 * @typedef {Object} Transcript
 * @property {Word[]} words
 * @property {Segment[]} segments
 * @property {string} language - Whisper language code, '' when unknown
 */

/**
 * @param {any} raw
 * @param {number} offset
 * @returns {Word|null}
 */
function toWord(raw, offset) {
  const word = String(raw?.word ?? raw?.text ?? '').trim();
  const start = Number(raw?.start);
  const end = Number(raw?.end);
  if (!word || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  /** @type {Word} */
  const out = { word, start: round3(start + offset), end: round3(Math.max(start, end) + offset) };
  const probability = Number(raw.probability ?? raw.score ?? raw.p);
  if (Number.isFinite(probability)) out.probability = Math.round(probability * 1000) / 1000;
  return out;
}

/**
 * Normalise a provider response.
 * @param {any} raw - `{ language?, segments?: [{ start, end, text, words? }], words? }`
 * @param {number} [offset=0] - Seconds added to every timestamp (chunked audio)
 * @returns {Transcript}
 */
export function normalizeTranscript(raw, offset = 0) {
  const rawSegments = Array.isArray(raw?.segments) ? raw.segments : [];
  const rawWords = Array.isArray(raw?.words)
    ? raw.words
    : rawSegments.flatMap((s) => (Array.isArray(s?.words) ? s.words : []));
  const words = rawWords.map((w) => toWord(w, offset)).filter(Boolean);
  const segments = [];
  for (const segment of rawSegments) {
    const text = String(segment?.text ?? '').trim();
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    segments.push({
      id: segments.length,
      start: round3(start + offset),
      end: round3(Math.max(start, end) + offset),
      text,
    });
  }
  return { words, segments, language: languageCode(raw?.language) };
}

/**
 * Concatenate transcripts of consecutive chunks (already offset).
 * @param {Transcript[]} parts
 * @returns {Transcript}
 */
export function mergeTranscripts(parts) {
  const words = parts.flatMap((p) => p.words);
  const segments = parts.flatMap((p) => p.segments).map((s, id) => ({ ...s, id }));
  return { words, segments, language: parts.find((p) => p.language)?.language || '' };
}

/**
 * Plan how to split a long recording into uploads of at most `maxSeconds`,
 * cutting inside a detected silence near each boundary when one is known so
 * no word is split.
 * @param {number} duration
 * @param {number} maxSeconds
 * @param {{ start: number, end: number }[]} [silences]
 * @returns {{ start: number, length: number }[]}
 */
export function planChunks(duration, maxSeconds, silences = []) {
  const chunks = [];
  let start = 0;
  while (duration - start > maxSeconds) {
    const limit = start + maxSeconds;
    const earliest = limit - Math.min(60, maxSeconds / 4);
    let cut = 0;
    for (const silence of silences) {
      const middle = (silence.start + silence.end) / 2;
      if (middle >= earliest && middle <= limit) cut = Math.max(cut, middle);
    }
    if (!cut) cut = limit; // no silence nearby: a hard cut
    chunks.push({ start: round3(start), length: round3(cut - start) });
    start = cut;
  }
  chunks.push({ start: round3(start), length: round3(duration - start) });
  return chunks;
}
