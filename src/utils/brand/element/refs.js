/**
 * References — how a design names a token or a slot instead of a value:
 * `{color.primary}`, `{font.heading}`, `{slot.name}`. A string that is one
 * reference and nothing else stands for the value itself, whatever its type
 * (a number, a font, a whole group); inside a longer string a reference is
 * written out as text. Substitution is one pass: what was filled in is
 * never read again, so a slot's text can hold braces without meaning
 * anything. Isomorphic and pure.
 * @module utils/brand/element/refs
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';

/** A reference anywhere in a string. */
const REFERENCE = /\{([a-z][\w-]*(?:\.[\w-]+)*)\}/gi;
/** A string that is exactly one reference. */
const WHOLE = /^\{([a-z][\w-]*(?:\.[\w-]+)*)\}$/i;
/** Containers nested deeper than this are not walked. */
const MAX_DEPTH = 8;

/**
 * @callback Lookup
 * @param {string} path - What stands between the braces
 * @returns {any} The value; undefined leaves the reference as written
 */

/**
 * Fill the references of one string in.
 * @param {string} text
 * @param {Lookup} lookup
 * @returns {any} A value of any type when the string was one reference,
 *   otherwise a string
 */
export function substitute(text, lookup) {
  if (!text.includes('{')) return text;
  const whole = WHOLE.exec(text);
  if (whole) {
    const value = lookup(whole[1]);
    return value === undefined ? text : value;
  }
  return text.replace(REFERENCE, (written, path) => {
    const value = lookup(path);
    return value === undefined || typeof value === 'object' ? written : String(value);
  });
}

/**
 * Fill references in throughout a JSON value. Containers that hold no
 * reference are returned as they are.
 * @param {any} value
 * @param {Lookup} lookup
 * @param {number} [depth]
 * @returns {any}
 */
export function fill(value, lookup, depth = 0) {
  if (typeof value === 'string') return substitute(value, lookup);
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const items = value.map((item) => fill(item, lookup, depth + 1));
    return items.some((item, i) => item !== value[i]) ? items : value;
  }
  if (!isPlainObject(value)) return value;
  let changed = false;
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = fill(value[key], lookup, depth + 1);
    if (out[key] !== value[key]) changed = true;
  }
  return changed ? out : value;
}

/**
 * The references a JSON value holds.
 * @param {any} value
 * @param {number} [depth]
 * @returns {string[]} Paths, each once, in reading order
 */
export function references(value, depth = 0) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @type {(node: any, level: number) => void} */
  const walk = (node, level) => {
    if (typeof node === 'string') {
      for (const match of node.matchAll(REFERENCE)) found.add(match[1]);
    } else if (level < MAX_DEPTH && node !== null && typeof node === 'object') {
      for (const child of Object.values(node)) walk(child, level + 1);
    }
  };
  walk(value, depth);
  return [...found];
}

/**
 * @param {string} path
 * @returns {string|null} The slot a reference names (`slot.name` → `name`)
 */
export const slotOf = (path) => (path.startsWith('slot.') ? path.slice(5) : null);

/**
 * Whether a `when` / `unless` value counts as present: text that is not
 * blank, a number that is not 0, `true`.
 * @param {any} value
 * @returns {boolean}
 */
export function isPresent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  return typeof value === 'number' ? value !== 0 : value === true;
}
