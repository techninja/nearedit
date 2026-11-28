/**
 * The built-in kits — ordinary kits that ship with NearEdit. Each defines
 * every token and every standard element, so any chain that ends in one is
 * complete. Isomorphic and pure.
 * @module utils/brand/kits
 */

import { BUILTIN_PREFIX } from '#utils/brand/limits.js';
import { normalizeKit } from '#utils/brand/normalize.js';
import clean from './clean/index.js';

const RAW = [clean];

/** @type {Map<string, import('#utils/brand/types.js').Kit>} */
const KITS = new Map(RAW.map((raw) => [raw.id, normalizeKit(raw)]));

/** The built-in kits as a list: `{ id, name, description }`, in menu order. */
export const BUILTIN_KITS = Object.freeze(
  RAW.map(({ id, name, description }) => Object.freeze({ id, name, description })),
);

/**
 * A built-in kit, normalised. The same object every time: it can be
 * compared by identity.
 * @param {unknown} id - `clean`, or `builtin:clean`
 * @returns {import('#utils/brand/types.js').Kit|undefined}
 */
export function builtinKit(id) {
  const name = String(id ?? '');
  return KITS.get(name.startsWith(BUILTIN_PREFIX) ? name.slice(BUILTIN_PREFIX.length) : name);
}
