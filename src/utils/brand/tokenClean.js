/**
 * Reading tokens out of whatever a kit file holds: each token is kept when
 * its value suits the schema and left out otherwise — a kit says only what
 * it changes, the rest is inherited. Only own properties of plain objects
 * are read. Isomorphic and pure.
 * @module utils/brand/tokenClean
 */

import { isHex } from '#utils/compose/color.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS } from './limits.js';
import { FONT_FIELDS, TOKEN_SCHEMA } from './tokens.js';

/** @typedef {import('./tokens.js').TokenSpec} TokenSpec */

/**
 * One value as its spec wants it.
 * @param {TokenSpec} spec
 * @param {any} value
 * @returns {any} undefined when the value cannot be used
 */
export function cleanToken(spec, value) {
  switch (spec.type) {
    case 'color':
      return isHex(value) ? value.toLowerCase() : undefined;
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
      return Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, n));
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'select':
      return (spec.options || []).includes(value) ? value : undefined;
    case 'image':
      return typeof value === 'string' && value.length <= LIMITS.path ? value : undefined;
    case 'font':
      return cleanFont(value);
    default:
      return typeof value === 'string' ? value.slice(0, spec.max ?? LIMITS.text) : undefined;
  }
}

/**
 * A font token: the fields that are usable, nothing else.
 * @param {any} value - `{ family, weight, … }`, or a family name
 * @returns {Record<string, any>|undefined} undefined when nothing is usable
 */
export function cleanFont(value) {
  const raw = typeof value === 'string' ? { family: value } : value;
  if (!isPlainObject(raw)) return undefined;
  /** @type {Record<string, any>} */
  const font = {};
  for (const [name, spec] of Object.entries(FONT_FIELDS)) {
    if (!Object.hasOwn(raw, name)) continue;
    const field = cleanToken(/** @type {TokenSpec} */ (spec), raw[name]);
    if (field !== undefined && field !== '') font[name] = field;
  }
  return Object.keys(font).length ? font : undefined;
}

/**
 * The tokens of a kit: every group and token the schema knows whose value
 * is usable.
 * @param {any} raw
 * @returns {Record<string, Record<string, any>>} Groups that hold nothing are left out
 */
export function cleanTokens(raw) {
  /** @type {Record<string, Record<string, any>>} */
  const tokens = {};
  if (!isPlainObject(raw)) return tokens;
  for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
    const given = Object.hasOwn(raw, group) ? raw[group] : undefined;
    if (!isPlainObject(given)) continue;
    /** @type {Record<string, any>} */
    const kept = {};
    for (const [name, spec] of Object.entries(specs)) {
      const value = Object.hasOwn(given, name) ? cleanToken(spec, given[name]) : undefined;
      if (value !== undefined) kept[name] = value;
    }
    if (Object.keys(kept).length) tokens[group] = kept;
  }
  return tokens;
}

/**
 * Merge the tokens of a chain, the child winning key by key; the fields of
 * a font token merge the same way.
 * @param {Record<string, Record<string, any>>[]} chain - Child first
 * @returns {Record<string, Record<string, any>>}
 */
export function mergeTokens(chain) {
  /** @type {Record<string, Record<string, any>>} */
  const merged = {};
  for (const tokens of [...chain].reverse()) {
    for (const [group, values] of Object.entries(tokens || {})) {
      merged[group] = { ...merged[group] };
      for (const [name, value] of Object.entries(values)) {
        const font = TOKEN_SCHEMA[group]?.[name]?.type === 'font';
        merged[group][name] = font ? { ...merged[group][name], ...value } : value;
      }
    }
  }
  return merged;
}
