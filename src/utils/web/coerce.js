/**
 * Reading values out of whatever a file, a form or a language model holds:
 * each helper returns a value of the wanted type and range, or the fallback.
 * Only own properties of plain objects are ever read. Isomorphic and pure.
 * @module utils/web/coerce
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP = /^https?:\/\/[^\s/?#]/i;
const HOST = /^https?:\/\/(?:[^/?#@]*@)?([^/?#]+)/i;

/**
 * @param {any} value
 * @returns {Record<string, any>} The value when it is a plain object, else `{}`
 */
export function record(value) {
  return isPlainObject(value) ? value : {};
}

/**
 * @param {Record<string, any>} object - A plain object
 * @param {string} key
 * @returns {any} Its own property; never one inherited from a prototype
 */
export function own(object, key) {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/**
 * @param {any} value - A number or a numeric string
 * @param {number} fallback
 * @returns {number} A finite number
 */
export function toNumber(value, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number + 0 : fallback;
}

/**
 * @param {any} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @param {boolean} [integer]
 * @returns {number} Within `min … max`
 */
export function numberIn(value, fallback, min, max, integer = false) {
  const number = toNumber(value, fallback);
  return Math.min(max, Math.max(min, integer ? Math.round(number) : number));
}

/**
 * @param {any} value - A string; a number is written out
 * @param {number} max - Longest result, characters
 * @param {string} [fallback]
 * @returns {string}
 */
export function textOf(value, max, fallback = '') {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return typeof text === 'string' ? text.slice(0, max) : fallback;
}

/**
 * @param {any} value - A boolean, or the words `true` / `false`
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function boolOf(value, fallback) {
  if (typeof value === 'boolean') return value;
  return value === 'true' ? true : value === 'false' ? false : fallback;
}

/**
 * @template {string} T
 * @param {any} value
 * @param {readonly T[]} options
 * @param {T} fallback
 * @returns {T}
 */
export function oneOf(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

/**
 * @param {any} value
 * @param {readonly string[]} options
 * @returns {string[]} The options that were named, each once, in table order
 */
export function someOf(value, options) {
  const named = Array.isArray(value) ? value : [];
  return options.filter((option) => named.includes(option));
}

/**
 * @param {any} value
 * @param {string} fallback
 * @returns {string} `#rrggbb` or `#rrggbbaa`
 */
export function colorOf(value, fallback) {
  return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

/**
 * The address of a page: absolute, `http:` or `https:`, kept as written.
 * @param {any} value
 * @param {number} max
 * @returns {string} '' for anything else — relative, `file:`, `javascript:`…
 */
export function pageUrl(value, max) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.length > max || !HTTP.test(url)) return '';
  // A host with white space parses in browsers and not in Node: refuse it in both.
  if (/\s/.test(url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0])) return '';
  // Browsers older than `URL.canParse` go by the pattern alone.
  return typeof URL.canParse !== 'function' || URL.canParse(url) ? url : '';
}

/**
 * @param {string} url - A page address
 * @returns {string} Its host, lower case, with the port when it has one;
 *   '' when there is none to be found
 */
export function hostOf(url) {
  const found = HOST.exec(typeof url === 'string' ? url.trim() : '');
  return found ? found[1].toLowerCase() : '';
}

/**
 * Where a `goto` step leads: an `http(s)` address or one relative to the
 * page (`/pricing`, `?tab=2`, `#top`).
 * @param {any} value
 * @param {number} max
 * @returns {string} '' for an address with any other scheme
 */
export function linkUrl(value, max) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.length > max) return '';
  return SCHEME.test(url) ? pageUrl(url, max) : url;
}
