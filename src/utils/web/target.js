/**
 * Target syntax — how a step says what it aims at (WEBCLIP.md § Targets):
 *
 *   text=Get started      the element showing that text
 *   label=Email           the form control with that label
 *   css=#pricing .card    a CSS selector; a bare string is one too
 *   point=640,300         a point of the viewport, also `{ x: 640, y: 300 }`
 *
 * Finding the element is the recorder's work; this only reads and writes
 * the notation. Isomorphic and pure.
 * @module utils/web/target
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own } from './coerce.js';
import { RECIPE_LIMITS } from './limits.js';

/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').ParsedTarget} ParsedTarget */

/** The ways of finding something, in the order the notation lists them. */
export const TARGET_FORMS = Object.freeze(['text', 'label', 'css', 'point']);

const PREFIXED = /^(text|label|css|point)=([\s\S]*)$/;
const POINT = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

/**
 * @param {number} x
 * @param {number} y
 * @returns {ParsedTarget|null} null when a coordinate is not a usable number
 */
function point(x, y) {
  const [min, max] = RECIPE_LIMITS.point;
  const usable = (n) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (!usable(x) || !usable(y)) return null;
  // Thousandths of a pixel: enough to aim with, and always plain digits.
  const [px, py] = [x, y].map((n) => Math.round(n * 1000) / 1000 + 0);
  return { by: 'point', value: `${px},${py}`, x: px, y: py };
}

/**
 * Read a target.
 * @param {any} target - A string, or `{ x, y }`
 * @returns {ParsedTarget|null} null for anything that names nothing: an
 *   empty string, `text=` without text, a point without two numbers
 */
export function parseTarget(target) {
  if (isPlainObject(target)) return point(own(target, 'x'), own(target, 'y'));
  if (typeof target !== 'string') return null;
  const whole = target.trim();
  if (!whole) return null;
  const prefixed = PREFIXED.exec(whole);
  if (!prefixed) return { by: 'css', value: whole };
  const by = /** @type {ParsedTarget['by']} */ (prefixed[1]);
  const value = prefixed[2].trim();
  if (!value) return null;
  if (by !== 'point') return { by, value };
  const numbers = POINT.exec(value);
  return numbers ? point(Number(numbers[1]), Number(numbers[2])) : null;
}

/**
 * Write a target as a string — the inverse of `parseTarget`. A CSS selector
 * is written bare unless it would read as another form.
 * @param {ParsedTarget|null|undefined} parsed
 * @returns {string} '' for nothing
 */
export function formatTarget(parsed) {
  if (!parsed || !TARGET_FORMS.includes(parsed.by)) return '';
  if (parsed.by === 'point') {
    const at = point(parsed.x, parsed.y);
    return at ? `point=${at.value}` : '';
  }
  const value = typeof parsed.value === 'string' ? parsed.value.trim() : '';
  if (!value) return '';
  return parsed.by === 'css' && !PREFIXED.test(value) ? value : `${parsed.by}=${value}`;
}

/**
 * A target as a recipe stores it: a trimmed, bounded string, or a point
 * `{ x, y }` inside the allowed range. What it names is not checked here.
 * @param {any} value
 * @returns {Target} '' for anything that cannot be a target
 */
export function cleanTarget(value) {
  if (typeof value === 'string') return value.trim().slice(0, RECIPE_LIMITS.target);
  if (!isPlainObject(value)) return '';
  const [min, max] = RECIPE_LIMITS.point;
  const x = own(value, 'x');
  const y = own(value, 'y');
  if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
  if (typeof x !== 'number' || typeof y !== 'number') return '';
  return { x: Math.min(max, Math.max(min, x)), y: Math.min(max, Math.max(min, y)) };
}

/**
 * @param {any} target
 * @returns {string} A target on one line, for labels and messages
 */
export function describeTarget(target) {
  return formatTarget(parseTarget(target));
}
