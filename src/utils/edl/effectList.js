/**
 * Effect stacks as data: `[{ effectId, type, enabled, params }]` on a clip
 * or a track. An effect's `type` is a name from the catalog (unknown to
 * this library) and its `params` a free-form bag; ids are unique within
 * their stack. Isomorphic and pure.
 * @module utils/edl/effectList
 */

import { newId } from './factory.js';
import { cleanBag, isPlainObject, sameJson } from './jsonBag.js';

/** @typedef {import('./types.js').Effect} Effect */

/** Effects one clip or track may carry. */
export const MAX_EFFECTS = 64;
/** An effect id is one segment of a keyframe path (`effects.<id>.<param>`). */
export const EFFECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TYPE = 100;

/**
 * @param {any} type
 * @returns {boolean} True for a usable effect or generator type name
 */
export function isTypeName(type) {
  return typeof type === 'string' && type !== '' && type.length <= MAX_TYPE;
}

/**
 * A clean effect stack: entries without a type are dropped, a missing,
 * malformed or repeated id is replaced by a fresh one.
 * @param {any} raw
 * @returns {Effect[]}
 */
export function cleanEffects(raw) {
  const taken = new Set();
  /** @type {Effect[]} */
  const out = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_EFFECTS * 4) : []) {
    if (out.length >= MAX_EFFECTS) break;
    if (!isPlainObject(item) || !isTypeName(item.type)) continue;
    const given = item.effectId ?? item.id;
    const kept = typeof given === 'string' && EFFECT_ID.test(given) && !taken.has(given);
    const effectId = kept ? given : newId('fx');
    taken.add(effectId);
    const enabled = item.enabled !== false && item.enabled !== 'false';
    out.push({ effectId, type: item.type, enabled, params: cleanBag(item.params) });
  }
  return out;
}

/**
 * Replace an effect stack with a cleaned copy of `patch`.
 * @param {Effect[]} base - A clean stack
 * @param {any} patch
 * @returns {Effect[]} `base` itself when nothing changed; effects that did
 *   not change keep their identity
 */
export function mergeEffects(base, patch) {
  if (!Array.isArray(patch)) return base;
  const out = cleanEffects(patch).map((fx, i) => (sameJson(fx, base[i]) ? base[i] : fx));
  return out.length === base.length && out.every((fx, i) => fx === base[i]) ? base : out;
}
