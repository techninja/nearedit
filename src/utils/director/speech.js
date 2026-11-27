/**
 * Word-boundary alignment over the `transcript` words of a sidecar
 * (docs/app-spec/API.md § Sidecar fields). Dead-air removal built on it
 * lives in tighten.js. Isomorphic and pure.
 * @module utils/director/speech
 */

/**
 * @typedef {{ word?: string, start: number, end: number, probability?: number }} Word
 * @typedef {{ start: number, end: number }} Span
 */

/**
 * A word must overlap a range by more than this to count as inside it, so a
 * rough boundary that grazes a neighbouring word does not pull it in.
 */
export const EDGE_TOLERANCE = 0.06;

/**
 * First and last word (by index) inside a time range.
 * @param {Word[]} words - Ascending by start
 * @param {number} start
 * @param {number} end
 * @returns {{ first: number, last: number } | null}
 */
export function wordRange(words, start, end) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const length = w.end - w.start;
    const overlap = Math.min(w.end, end) - Math.max(w.start, start);
    const instant = length < 1e-3 && w.start >= start && w.end <= end;
    if (!instant && overlap <= Math.min(EDGE_TOLERANCE, length / 2)) continue;
    if (first < 0) first = i;
    last = i;
  }
  return first < 0 ? null : { first, last };
}

/**
 * Padded edges of the words first..last. Padding never reaches past the
 * midpoint of the gap to a neighbouring word, and never cuts into a word.
 * @param {Word[]} words
 * @param {number} first
 * @param {number} last
 * @param {number} padding
 * @returns {Span}
 */
export function paddedEdges(words, first, last, padding) {
  const head = words[first].start;
  const tail = words[last].end;
  const prev = words[first - 1];
  const next = words[last + 1];
  let start = head - padding;
  if (prev) start = Math.min(head, Math.max(start, (prev.end + head) / 2));
  let end = tail + padding;
  if (next) end = Math.max(tail, Math.min(end, (tail + next.start) / 2));
  return { start: Math.max(0, start), end };
}

/**
 * Snap a rough range outward to word boundaries with a little padding.
 * @param {Word[]} words
 * @param {number} start
 * @param {number} end
 * @param {number} [padding=0.08]
 * @returns {Span & { snapped: boolean }} `snapped` is false when no word lies in the range
 */
export function alignToWords(words, start, end, padding = 0.08) {
  const range = wordRange(words || [], start, end);
  if (!range) return { start, end, snapped: false };
  return { ...paddedEdges(words, range.first, range.last, padding), snapped: true };
}
