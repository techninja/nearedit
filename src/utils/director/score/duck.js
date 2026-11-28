/**
 * Ducking: where people speak, the music steps back. Stretches of speech
 * that lie close together are joined — the bed does not jump up between
 * two sentences — and each becomes four volume keyframes: down just before
 * the first word, back up a moment after the last.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Under speech. Isomorphic and pure.
 * @module utils/director/score/duck
 */

/** @typedef {{ start: number, end: number }} Span - Seconds */
/** @typedef {{ t: number, v: number, ease: string }} Key - A keyframe of a clip's `volume` */

/** Seconds a ramp down or up takes. */
export const RAMP = 0.25;
/** Seconds before the first word by which the music is already down. */
export const LEAD = 0.05;
/** Seconds after the last word before the music starts back up. */
export const HOLD = 0.3;
/** Stretches of speech closer together than this are ducked as one. */
export const JOIN = 1.5;

const tidy = (/** @type {number} */ value, /** @type {number} */ digits) =>
  Math.round(value * digits) / digits;

/**
 * Join the spans that overlap or lie closer together than `gap`.
 * @param {Span[]} spans - In any order
 * @param {number} [gap=0]
 * @returns {Span[]} Ascending, apart by more than `gap`
 */
export function joinSpans(spans, gap = 0) {
  const sorted = spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  /** @type {Span[]} */
  const joined = [];
  for (const span of sorted) {
    const last = joined[joined.length - 1];
    if (last && span.start - last.end <= gap) last.end = Math.max(last.end, span.end);
    else joined.push({ start: span.start, end: span.end });
  }
  return joined;
}

/**
 * @param {number} decibels - How much quieter
 * @returns {number} The gain that does it
 */
export const gainOf = (decibels) => 10 ** (-Math.max(0, decibels) / 20);

/**
 * The stretches the music is ducked over: speech inside `0 … length`,
 * joined across short gaps.
 * @param {Span[]} speech - Seconds from the start of the music clip
 * @param {number} length - Of the clip
 * @returns {Span[]}
 */
export function duckSpans(speech, length) {
  const inside = speech
    .map((span) => ({ start: Math.max(0, span.start), end: Math.min(length, span.end) }))
    .filter((span) => span.end > span.start);
  return joinSpans(inside, JOIN);
}

/**
 * The volume keyframes that duck a music clip under speech.
 * @param {Span[]} speech - Seconds from the start of the clip
 * @param {{ length: number, level: number, depth: number }} opts - `length`
 *   of the clip; `level`: its volume where nobody speaks; `depth`: decibels
 *   it drops by under speech (0 = no ducking)
 * @returns {Key[]} In order; empty without speech or depth. Times are
 *   seconds from the start of the clip — its source time, when its source
 *   window starts at 0
 */
export function duckKeys(speech, { length, level, depth }) {
  const low = tidy(level * gainOf(depth), 1e4);
  if (!(depth > 0) || low >= level) return [];
  /** @type {Key[]} */
  const keys = [];
  const key = (/** @type {number} */ t, /** @type {number} */ v, ease = 'linear') =>
    keys.push({ t: tidy(t, 1e3), v, ease });
  for (const span of duckSpans(speech, length)) {
    const down = span.start - LEAD;
    const up = span.end + HOLD;
    // Speech at the very start: the music begins low.
    if (down - RAMP <= 0) key(0, low);
    else {
      key(down - RAMP, level, 'sine');
      key(down, low);
    }
    // Speech to the very end: it stays low.
    if (up + RAMP >= length) continue;
    key(up, low, 'sine');
    key(up + RAMP, level);
  }
  return keys;
}

/**
 * How much of a length the spans cover.
 * @param {Span[]} spans
 * @param {number} length
 * @returns {number} 0 … 1
 */
export function coverage(spans, length) {
  if (!(length > 0)) return 0;
  const covered = joinSpans(spans).reduce(
    (sum, span) => sum + Math.max(0, Math.min(length, span.end) - Math.max(0, span.start)),
    0,
  );
  return Math.min(1, covered / length);
}
