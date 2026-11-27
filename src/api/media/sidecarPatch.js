/**
 * Validation of sidecar patches sent by clients (user edits to tags,
 * description, transcript). The analysis pipeline and the director read
 * these fields back, so a patch may not change their shape.
 * @module api/media/sidecarPatch
 */

import { HttpError, assertValid } from '../lib/httpErrors.js';

/** @param {unknown} value @returns {boolean} */
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {boolean} */
const isTime = (value) => Number.isFinite(value) && /** @type {number} */ (value) >= 0;
/** @param {any} span @returns {boolean} */
const isSpan = (span) => isObject(span) && isTime(span.start) && isTime(span.end);

/**
 * Shape checks for the fields other code depends on. Each returns true when
 * the value is acceptable; `null` always is (it clears an analysis result).
 * @type {Record<string, { test: (value: any) => boolean, expects: string }>}
 */
const RULES = {
  tags: {
    test: (v) => Array.isArray(v) && v.every((tag) => typeof tag === 'string'),
    expects: 'an array of strings',
  },
  description: { test: (v) => typeof v === 'string', expects: 'text' },
  language: { test: (v) => typeof v === 'string', expects: 'text' },
  transcript: {
    test: (v) => Array.isArray(v) && v.every((w) => isSpan(w) && typeof w.word === 'string'),
    expects: 'an array of { word, start, end }',
  },
  segments: {
    test: (v) => Array.isArray(v) && v.every((s) => isSpan(s) && typeof s.text === 'string'),
    expects: 'an array of { start, end, text }',
  },
  keyframes: {
    test: (v) => Array.isArray(v) && v.every((k) => isObject(k) && isTime(k.time)),
    expects: 'an array of { time, tags }',
  },
  beats: { test: (v) => Array.isArray(v) && v.every(isTime), expects: 'an array of seconds' },
  bpm: { test: (v) => Number.isFinite(v) && v > 0, expects: 'a positive number' },
  scenes: {
    test: (v) => Array.isArray(v) && v.every(isSpan),
    expects: 'an array of { start, end }',
  },
  silences: {
    test: (v) => Array.isArray(v) && v.every(isSpan),
    expects: 'an array of { start, end }',
  },
};

/**
 * Validate a sidecar patch.
 * @param {unknown} body - Parsed request body
 * @returns {Record<string, any>} The patch, without server-managed `_` fields
 * @throws {HttpError} 400 when the body is not an object, 422 when a field has the wrong shape
 */
export function cleanSidecarPatch(body) {
  if (!isObject(body)) throw new HttpError(400, 'A JSON object of sidecar fields is required');
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {Record<string, any>} */
  const patch = {};
  for (const [key, value] of Object.entries(/** @type {object} */ (body))) {
    if (key.startsWith('_')) continue; // freshness stamps belong to the server
    const rule = Object.hasOwn(RULES, key) ? RULES[key] : null;
    if (rule && value !== null && !rule.test(value)) fields[key] = `Must be ${rule.expects}`;
    else patch[key] = value;
  }
  assertValid(fields);
  return patch;
}
