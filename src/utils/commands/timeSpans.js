/**
 * Arithmetic of the time selection: extending it from an anchor, the span
 * between two markers, and the short history that Backspace walks — and
 * reading a time someone typed. Pure.
 * @module utils/commands/timeSpans
 */

import { parseTimecode, timecodeBase } from '#utils/playback/timecode.js';

/** @typedef {{ start: number, end: number }} Span */

/** Selections kept for recall, as in Vegas. */
export const HISTORY_LIMIT = 5;

/**
 * @param {Span|null|undefined} span
 * @returns {boolean} True when the span has a length
 */
export const hasLength = (span) => !!span && span.end > span.start;

/**
 * Extend (or start) a selection by moving the cursor. The end the cursor
 * sits on moves with it and the other end is the anchor; a cursor that is
 * on neither end starts a new selection from where it stands.
 * @param {Span|null} current - The selection now; null or empty for none
 * @param {number} cursor - Where the cursor is
 * @param {number} target - Where the cursor goes
 * @param {number} [tolerance=1e-3] - How close "on an end" is, seconds
 * @returns {Span & { fresh: boolean }} `fresh`: a new selection was started
 */
export function extendSpan(current, cursor, target, tolerance = 1e-3) {
  const on = (time) => Math.abs(time - cursor) <= tolerance;
  const held = hasLength(current) && (on(current.start) || on(current.end));
  const anchor = !held ? cursor : on(current.end) ? current.start : current.end;
  return { start: Math.min(anchor, target), end: Math.max(anchor, target), fresh: !held };
}

/**
 * The stretch between the markers on either side of a time (Vegas:
 * double-click between two markers). The start of the timeline and its end
 * stand in where there is no marker on a side.
 * @param {number[]} times - Marker times, in any order
 * @param {number} time
 * @param {number} duration - End of the timeline, seconds
 * @returns {Span}
 */
export function spanAround(times, time, duration) {
  const before = times.filter((each) => each <= time);
  const after = times.filter((each) => each > time);
  const start = before.length ? Math.max(...before) : 0;
  const end = after.length ? Math.min(...after) : Math.max(duration, start);
  return { start, end };
}

/**
 * Remember a selection that is about to be replaced.
 * @param {Span[]} history - Oldest first
 * @param {Span|null} span - Ignored when empty or the same as the latest
 * @returns {Span[]} At most `HISTORY_LIMIT` entries
 */
export function remembered(history, span) {
  const latest = history[history.length - 1];
  if (!hasLength(span)) return history;
  if (latest && latest.start === span.start && latest.end === span.end) return history;
  return [...history, { start: span.start, end: span.end }].slice(-HISTORY_LIMIT);
}

/**
 * Step back through the history: the latest remembered selection comes
 * back, and the one it replaces goes to the far end, so repeated recalls
 * cycle through them all.
 * @param {Span[]} history - Oldest first
 * @param {Span|null} current
 * @returns {{ history: Span[], span: Span|null }} `span` null when there is nothing to recall
 */
export function recalled(history, current) {
  if (!history.length) return { history, span: null };
  const span = history[history.length - 1];
  const rest = history.slice(0, -1);
  return { history: hasLength(current) ? [{ ...current }, ...rest] : rest, span };
}

/**
 * Read a typed time, the ways an editor writes one:
 *
 * - timecode, leading fields optional: `1:02:03:04`, `10:00` (ten seconds);
 * - bare digits fill the timecode from the right, as in Vegas: `1000` is
 *   `00:00:10:00`, `12` is frame 12;
 * - a decimal point means seconds: `12.5`;
 * - a leading `+` or `-` moves from the current time instead.
 * @param {string} text
 * @param {number} [fps=30]
 * @param {number} [current=0] - Where the cursor is, for relative entries
 * @returns {number} Seconds, never below 0; NaN when the text is not a time
 */
export function parseTimeEntry(text, fps = 30, current = 0) {
  const entry = String(text ?? '').trim();
  const sign = entry.startsWith('+') ? 1 : entry.startsWith('-') ? -1 : 0;
  const body = sign ? entry.slice(1).trim() : entry;
  let seconds = NaN;
  if (/^\d*\.\d+$|^\d+\.$/.test(body)) seconds = Number(body);
  else if (/^\d{1,9}$/.test(body)) {
    // Pairs of digits from the right: frames, seconds, minutes, hours.
    const width = Math.max(2, String(timecodeBase(fps) - 1).length);
    const pairs = [
      body.slice(-width),
      ...(body.slice(0, -width).match(/\d{1,2}(?=(\d{2})*$)/g) || []),
    ];
    seconds = parseTimecode([...pairs.slice(1), pairs[0]].join(':'), fps);
  } else seconds = parseTimecode(body, fps);
  if (!Number.isFinite(seconds)) return NaN;
  return Math.max(0, sign ? current + sign * seconds : seconds);
}
