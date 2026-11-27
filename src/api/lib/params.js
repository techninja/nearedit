/**
 * Query-string readers. Express hands back strings, arrays or nested objects
 * depending on what the client sent; these reduce a value to one safe scalar.
 * @module api/lib/params
 */

/**
 * @param {unknown} value - A raw `req.query` value
 * @returns {string} The first string given, or ''
 */
export function stringParam(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

/**
 * Read a number and clamp it into a range.
 * @param {unknown} value - A raw `req.query` value
 * @param {number} fallback - Used when the value is missing or not a number
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function numberParam(value, fallback, min, max) {
  const text = stringParam(value).trim();
  const parsed = text === '' ? NaN : Number(text);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Read an integer and clamp it into a range.
 * @param {unknown} value - A raw `req.query` value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function intParam(value, fallback, min, max) {
  return Math.round(numberParam(value, fallback, min, max));
}
