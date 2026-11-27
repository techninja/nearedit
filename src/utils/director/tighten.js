/**
 * Dead-air removal: the stretches of a source range worth keeping, from
 * word timestamps or detected silences. Isomorphic and pure.
 * @module utils/director/tighten
 */

import { wordRange, paddedEdges } from './speech.js';

/**
 * @typedef {import('./speech.js').Word} Word
 * @typedef {import('./speech.js').Span} Span
 * @typedef {{ threshold?: number, padding?: number }} TightenOptions
 */

/**
 * Join runs that touch or overlap.
 * @param {Span[]} runs - Ascending
 * @returns {Span[]}
 */
export function mergeTouching(runs) {
  const merged = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run.start <= prev.end + 1e-6) prev.end = Math.max(prev.end, run.end);
    else merged.push({ ...run });
  }
  return merged;
}

/**
 * The spoken stretches of a range: words grouped wherever the pause between
 * them is no longer than `threshold`, each group padded so cuts do not sound
 * breathless.
 * @param {Word[]} words
 * @param {number} start
 * @param {number} end
 * @param {TightenOptions} [opts]
 * @returns {Span[]} Empty when the range holds no words
 */
export function speechRuns(words, start, end, opts = {}) {
  const { threshold = 0.8, padding = 0.1 } = opts;
  const range = wordRange(words || [], start, end);
  if (!range) return [];
  const runs = [];
  let runFirst = range.first;
  for (let i = range.first + 1; i <= range.last + 1; i++) {
    const closes = i > range.last || words[i].start - words[i - 1].end > threshold;
    if (!closes) continue;
    runs.push(paddedEdges(words, runFirst, i - 1, padding));
    runFirst = i;
  }
  return mergeTouching(runs);
}

/**
 * The stretches of a range that remain when detected silences of at least
 * `threshold` seconds are cut out, leaving `padding` of each silence in place.
 * @param {Span[]} silences
 * @param {number} start
 * @param {number} end
 * @param {TightenOptions} [opts]
 * @returns {Span[]}
 */
export function runsFromSilences(silences, start, end, opts = {}) {
  const { threshold = 0.8, padding = 0.1 } = opts;
  const runs = [];
  let cursor = start;
  for (const silence of [...(silences || [])].sort((a, b) => a.start - b.start)) {
    const from = Math.max(silence.start, start);
    const to = Math.min(silence.end, end);
    if (to - from < threshold || to - from <= 2 * padding) continue;
    if (from > start + 1e-6 && from + padding > cursor)
      runs.push({ start: cursor, end: from + padding });
    cursor = to >= end - 1e-6 ? end : Math.max(cursor, to - padding);
  }
  if (end - cursor > 1e-3) runs.push({ start: cursor, end });
  return runs;
}

/**
 * Stretches of a source range worth keeping, from the best data available:
 * word timestamps, else detected silences, else the range untouched.
 * @param {{ words?: Word[], silences?: Span[] }} source
 * @param {number} start
 * @param {number} end
 * @param {TightenOptions} [opts]
 * @returns {{ runs: Span[], basis: 'words'|'silences'|'none' }}
 */
export function keepRuns(source, start, end, opts = {}) {
  if (source.words?.length) {
    const runs = speechRuns(source.words, start, end, opts);
    return runs.length ? { runs, basis: 'words' } : { runs: [{ start, end }], basis: 'none' };
  }
  if (source.silences?.length)
    return { runs: runsFromSilences(source.silences, start, end, opts), basis: 'silences' };
  return { runs: [{ start, end }], basis: 'none' };
}
