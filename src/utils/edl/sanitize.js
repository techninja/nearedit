/**
 * Value coercion shared by normalisation and inspector edits: turn anything
 * (LLM output, old files, form input) into the type, range and enum a field
 * expects, falling back to a known-good value. Isomorphic and pure.
 * @module utils/edl/sanitize
 */

/** Allowed values of enumerated fields, by key. */
export const ENUMS = {
  fit: ['cover', 'contain'],
  fontFamily: ['sans-serif', 'serif', 'monospace'],
  align: ['left', 'center', 'right'],
};

/** Numeric ranges, by key. Any key containing "crop" is a 0..1 fraction. */
const RANGES = {
  volume: [0, 2],
  opacity: [0, 1],
  anchorX: [0, 1],
  anchorY: [0, 1],
  fontSize: [1, 4000],
  outlineWidth: [0, 1000],
};

/**
 * @param {any} value
 * @returns {boolean} True for plain objects (not arrays, not null)
 */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {any} value - Number or numeric string
 * @param {number} fallback
 * @returns {number} A finite number
 */
export function toNumber(value, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : fallback;
}

/**
 * Coerce one value to the type of `fallback`, honouring ranges and enums.
 * @param {string} key - Field name, selects the range or enum
 * @param {any} value
 * @param {any} fallback - Known-good value; also defines the wanted type
 * @returns {any}
 */
export function coerce(key, value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof fallback === 'number') {
    const range = RANGES[key] || (/crop/i.test(key) ? [0, 1] : null);
    const number = toNumber(value, fallback);
    return range ? Math.min(range[1], Math.max(range[0], number)) : number;
  }
  if (typeof fallback === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' ? true : value === 'false' ? false : fallback;
  }
  if (typeof fallback === 'string') {
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string') return fallback;
    return ENUMS[key] && !ENUMS[key].includes(text) ? fallback : text;
  }
  return isObject(fallback) ? mergeShape(fallback, value) : fallback;
}

/**
 * Deep-merge `patch` into `base`, keeping exactly the keys of `base`.
 * Values of the wrong type, out-of-enum strings and unknown keys are
 * ignored; numbers are clamped to the field's range.
 * @param {Record<string, any>} base - Complete, valid object
 * @param {any} patch
 * @returns {Record<string, any>} `base` itself when nothing changed
 */
export function mergeShape(base, patch) {
  if (!isObject(patch)) return base;
  let changed = false;
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(base)) {
    out[key] = coerce(key, patch[key], base[key]);
    if (out[key] !== base[key]) changed = true;
  }
  return changed ? out : base;
}
