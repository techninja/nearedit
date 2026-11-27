/**
 * In/out marks on source files — "use only this part" before a file is
 * added to the timeline. Marks are remembered per file for the session.
 * @module utils/media/ranges
 */

/**
 * @typedef {Object} SourceMarks
 * @property {number|null} in - Seconds, null when not set
 * @property {number|null} out - Seconds, null when not set
 */

/** @type {SourceMarks} */
export const NO_MARKS = Object.freeze({ in: null, out: null });

/**
 * Set the in point. An out point at or before it is dropped.
 * @param {SourceMarks} marks
 * @param {number} time
 * @param {number} [duration] - Source duration when known
 * @returns {SourceMarks}
 */
export function withIn(marks, time, duration = Infinity) {
  const at = Math.min(Math.max(0, time), duration);
  return { in: at, out: marks.out !== null && marks.out > at ? marks.out : null };
}

/**
 * Set the out point. An in point at or after it is dropped.
 * @param {SourceMarks} marks
 * @param {number} time
 * @param {number} [duration]
 * @returns {SourceMarks}
 */
export function withOut(marks, time, duration = Infinity) {
  const at = Math.min(Math.max(0, time), duration);
  return { in: marks.in !== null && marks.in < at ? marks.in : null, out: at };
}

/**
 * The source range the marks select, as `insertMedia` options.
 * @param {SourceMarks} marks
 * @param {number|null} [duration] - Source duration when known
 * @returns {{ sourceIn: number, sourceOut?: number }|null} null when no mark
 *   is set (use the whole file)
 */
export function markedRange(marks, duration = null) {
  if (!marks || (marks.in === null && marks.out === null)) return null;
  const sourceIn = marks.in ?? 0;
  const end = marks.out ?? (duration > 0 ? duration : null);
  if (end === null) return { sourceIn };
  return end > sourceIn ? { sourceIn, sourceOut: end } : null;
}

/** @type {Map<string, SourceMarks>} */
const store = new Map();

/**
 * @param {string} path - Absolute path of the source file
 * @returns {SourceMarks}
 */
export const getMarks = (path) => store.get(path) || NO_MARKS;

/**
 * Remember (or with `NO_MARKS`, forget) the marks of a file.
 * @param {string} path
 * @param {SourceMarks} marks
 * @returns {SourceMarks}
 */
export function setMarks(path, marks) {
  if (marks.in === null && marks.out === null) store.delete(path);
  else store.set(path, marks);
  return getMarks(path);
}
