/**
 * Keyframe lists as data: turning whatever a file or an LLM holds into
 * clean keys — finite `t`, a number or hex colour `v`, a known `ease` —
 * sorted by time with one key per moment. Whether a path addresses
 * anything in its clip is decided in clipPaths.js. Isomorphic and pure.
 * @module utils/edl/keyList
 */

import { isColor } from './animate.js';
import { EASINGS } from './easing.js';
import { isPlainObject, isSafeKey, sameJson } from './jsonBag.js';

/** @typedef {{ t: number, v: number|string, ease: string }} Key */
/** @typedef {Record<string, Key[]>} Keyframes */

/** Keys one path may hold, and animated paths one clip may hold. */
export const MAX_KEYS = 2000;
export const MAX_PATHS = 256;
/** Keys closer together than this are one key. */
export const SAME_T = 1e-6;

/** @type {(value: any) => number} A finite number (numeric strings count), else NaN. */
const numeric = (value) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number + 0 : NaN;
};

/**
 * @param {any} raw
 * @returns {Key|null} null for a key without a finite `t` or a usable `v`
 */
export function cleanKey(raw) {
  if (!isPlainObject(raw)) return null;
  const t = numeric(raw.t);
  const v = isColor(raw.v) ? raw.v : numeric(raw.v);
  if (Number.isNaN(t) || (typeof v === 'number' && Number.isNaN(v))) return null;
  return { t, v, ease: EASINGS.includes(raw.ease) ? raw.ease : 'linear' };
}

/**
 * Order keys by time. Of several keys at one moment the last one given wins.
 * @param {Key[]} keys - Clean keys
 * @returns {Key[]}
 */
export function sortKeys(keys) {
  const sorted = keys.map((key, i) => ({ key, i })).sort((a, b) => a.key.t - b.key.t || a.i - b.i);
  /** @type {Key[]} */
  const out = [];
  for (const { key } of sorted) {
    const last = out[out.length - 1];
    if (last && key.t - last.t <= SAME_T) out[out.length - 1] = { ...key, t: last.t };
    else out.push(key);
  }
  return out.slice(0, MAX_KEYS);
}

/**
 * @param {any} raw
 * @returns {Key[]} Clean, sorted keys; empty for anything unusable
 */
export function cleanKeys(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Key[]} */
  const keys = [];
  for (const item of raw.slice(0, MAX_KEYS * 2)) {
    const key = cleanKey(item);
    if (key) keys.push(key);
  }
  return sortKeys(keys);
}

/**
 * Merge a patch into a keyframe map, path by path: a list replaces the keys
 * of its path, `null` or `[]` removes the path, anything unusable is
 * ignored.
 * @param {Keyframes} base - A clean map
 * @param {any} patch
 * @returns {Keyframes} `base` itself when nothing changed
 */
export function mergeKeyframes(base, patch) {
  if (!isPlainObject(patch)) return base;
  /** @type {Keyframes} */
  const out = { ...base };
  for (const path of Object.keys(patch).filter(isSafeKey)) {
    const given = patch[path];
    const keys = cleanKeys(given);
    const room = Object.hasOwn(out, path) || Object.keys(out).length < MAX_PATHS;
    if (keys.length && room) out[path] = sameJson(keys, base[path]) ? base[path] : keys;
    else if (given === null || (Array.isArray(given) && !given.length)) delete out[path];
  }
  const paths = Object.keys(out);
  const same = paths.length === Object.keys(base).length && paths.every((p) => out[p] === base[p]);
  return same ? base : out;
}
