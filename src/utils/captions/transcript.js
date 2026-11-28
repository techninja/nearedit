/**
 * From a file's transcript to caption words. A sidecar holds `transcript`
 * (one entry per word, with times) and `segments` (phrases, with times);
 * a provider that gives no word times leaves only the segments, and their
 * words are then spread across each segment by length.
 * Isomorphic and pure. Shapes: docs/app-spec/INTELLIGENCE.md § Transcription.
 * @module utils/captions/transcript
 */

import { MAX_WORDS, repairWords } from './words.js';

/** @typedef {import('./types.js').Word} Word */

/** @type {WeakMap<object, Word[]>} Words by the transcript they were made from */
const memo = new WeakMap();

/**
 * The words of segments, each given a share of its segment's time by its
 * length (a short pause is counted after every word, so "a" is not a blip).
 * @param {any[]} segments - `[{ start, end, text }]`
 * @returns {Word[]}
 */
function spread(segments) {
  /** @type {Word[]} */
  const words = [];
  for (const segment of segments) {
    const { start, end } = segment || {};
    const texts = String(segment?.text ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (!texts.length || !Number.isFinite(start) || !(end > start)) continue;
    const weight = (/** @type {string} */ text) => [...text].length + 2;
    const total = texts.reduce((sum, text) => sum + weight(text), 0);
    let at = start;
    texts.forEach((text, i) => {
      // The last word ends exactly where its segment does.
      const next = i === texts.length - 1 ? end : at + ((end - start) * weight(text)) / total;
      words.push([at, next, text]);
      at = next;
    });
    if (words.length >= MAX_WORDS) break;
  }
  return words;
}

/**
 * Whether a file's sidecar says anything captions can show: timed words,
 * or phrases. An interface asks this to tell "captions are on" from
 * "captions are on, but this file has no transcript yet".
 * @param {unknown} sidecar - A sidecar, or null when the file has none
 * @returns {boolean}
 */
export function hasTranscript(sidecar) {
  const some = (/** @type {unknown} */ list) => Array.isArray(list) && list.length > 0;
  const data = /** @type {any} */ (sidecar);
  return (
    Boolean(data) && typeof data === 'object' && (some(data.transcript) || some(data.segments))
  );
}

/**
 * The caption words of a transcript, repaired and in time order.
 * @param {unknown} transcript - A sidecar (`{ transcript, segments }`), or
 *   its list of words (`[{ word, start, end }]`, or triples)
 * @returns {Word[]} The same array for the same transcript object, so what
 *   is worked out from it can be remembered
 */
export function wordsFromTranscript(transcript) {
  if (transcript === null || typeof transcript !== 'object') return [];
  const known = memo.get(transcript);
  if (known) return known;
  const sidecar = /** @type {any} */ (transcript);
  const timed = Array.isArray(sidecar) ? sidecar : sidecar.transcript;
  let words = repairWords(timed);
  if (!words.length && Array.isArray(sidecar.segments)) {
    words = repairWords(spread(sidecar.segments));
  }
  memo.set(transcript, words);
  return words;
}
