/**
 * Free-form parameter bags (`generator.params`, an effect's `params`). The
 * schema does not know their keys — the generator and effect catalog does —
 * so they are kept, but only as bounded, JSON-safe data: finite numbers,
 * strings, booleans, and plain objects and arrays of those. Anything else
 * (functions, NaN, null, class instances, cycles, `__proto__` keys, values
 * nested too deep or past the size budget) is dropped. Isomorphic and pure.
 * @module utils/edl/jsonBag
 */

/** Containers may nest this deep, the bag itself included. */
export const MAX_DEPTH = 6;
/** Values (containers and leaves) one bag may hold. */
export const MAX_NODES = 2000;
/** Longer strings are cut to this many characters. */
export const MAX_STRING = 20000;
const MAX_KEY = 200;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @param {any} value
 * @returns {boolean} True for objects made by `{}` or `JSON.parse`
 */
export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/**
 * @param {any} key
 * @returns {boolean} True for a key that is safe to copy into a plain object
 */
export function isSafeKey(key) {
  return typeof key === 'string' && key !== '' && key.length <= MAX_KEY && !UNSAFE.has(key);
}

/**
 * @param {any} value
 * @param {number} depth - Depth of `value`; the bag is 0
 * @param {{ left: number }} budget - Values that may still be kept
 * @param {Set<any>} path - Containers being visited (cycle guard)
 * @returns {any} The clean value, or undefined to drop it
 */
function clean(value, depth, budget, path) {
  if (budget.left <= 0) return undefined;
  budget.left--;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value + 0 : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  const list = Array.isArray(value);
  if ((!list && !isPlainObject(value)) || depth >= MAX_DEPTH || path.has(value)) return undefined;
  path.add(value);
  /** @type {any} */
  const out = list ? [] : {};
  for (const key of list ? value.keys() : Object.keys(value)) {
    if (budget.left <= 0) break;
    if (!list && !isSafeKey(key)) continue;
    const child = clean(value[key], depth + 1, budget, path);
    if (child === undefined) continue;
    if (list) out.push(child);
    else out[key] = child;
  }
  path.delete(value);
  return out;
}

/**
 * A JSON-safe copy of one value as it may sit directly in a bag.
 * @param {any} value
 * @returns {any} undefined when nothing of it can be kept
 */
export function cleanValue(value) {
  return clean(value, 1, { left: MAX_NODES }, new Set());
}

/**
 * A JSON-safe, bounded copy of a parameter bag.
 * @param {any} raw
 * @returns {Record<string, any>} `{}` for anything that is not a plain object
 */
export function cleanBag(raw) {
  return isPlainObject(raw) ? clean(raw, 0, { left: MAX_NODES + 1 }, new Set()) : {};
}

/**
 * Deep equality of two JSON-safe values (key order does not matter).
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

/**
 * Merge a patch into a bag, key by key: a `null` removes its key, a value
 * that cannot be kept is ignored, everything else replaces what was there.
 * @param {Record<string, any>} base - A clean bag
 * @param {any} patch
 * @returns {Record<string, any>} `base` itself when nothing changed
 */
export function mergeBag(base, patch) {
  if (!isPlainObject(patch)) return base;
  const merged = { ...base };
  for (const key of Object.keys(patch).filter(isSafeKey)) {
    const value = patch[key] === null ? undefined : cleanValue(patch[key]);
    if (patch[key] === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  const out = cleanBag(merged);
  return sameJson(out, base) ? base : out;
}
