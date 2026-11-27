/**
 * Value coercion for plan normalisation: the ways a language model writes
 * times and segment numbers.
 * @module api/director/plan/coerce
 */

/**
 * Seconds from a number, "12.5", "12.5s" or "1:05".
 * @param {unknown} value
 * @returns {unknown} A number when understood, else the value untouched
 */
export function toSeconds(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (/^\d+(\.\d+)?\s*s?$/i.test(text)) return parseFloat(text);
  const clock = text.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (!clock) return value;
  return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
}

/**
 * Segment numbers from 3, "s3", "3-6" or a list of those.
 * @param {unknown} value
 * @returns {unknown}
 */
export function toSegments(value) {
  const items = Array.isArray(value) ? value : [value];
  const numbers = [];
  for (const item of items) {
    if (typeof item === 'number') numbers.push(item);
    else if (typeof item === 'string' && /^\s*s?\d+(\s*[-–]\s*s?\d+)?\s*$/i.test(item))
      numbers.push(...item.match(/\d+/g).map(Number));
    else return value;
  }
  return numbers;
}
