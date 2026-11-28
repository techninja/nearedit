/**
 * References inside a Design Tokens file (format module 2025.10 § 6.4 and
 * § 7): where a reference points — `{group.token}`, or a JSON Pointer
 * (`#/group/token`) — and groups that extend other groups (`$extends`: the
 * inherited group laid under the local one). Isomorphic and pure.
 * @module utils/theme/tokens/refs
 */

import { isPlainObject, isSafeKey } from '#utils/edl/jsonBag.js';

/** How deep groups and reference chains are followed before a file counts as broken. */
export const MAX_HOPS = 16;

/**
 * @param {unknown} node
 * @returns {boolean} True for a token: an object with a `$value` or a `$ref`
 */
export const isToken = (node) =>
  isPlainObject(node) && ('$value' in /** @type {object} */ (node) || '$ref' in /** @type {object} */ (node));

/**
 * The segments a reference names.
 * @param {unknown} ref - `{a.b}` or `#/a/b`
 * @returns {string[]|null} null for anything that is not a reference
 */
export function refSegments(ref) {
  if (typeof ref !== 'string') return null;
  const curly = /^\{([^{}]+)\}$/.exec(ref);
  if (curly) return curly[1].split('.');
  if (ref === '#' || ref === '#/') return [];
  if (!ref.startsWith('#/')) return null;
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * @param {unknown} root
 * @param {string[]} segments
 * @returns {unknown} What is there; undefined when the path leads nowhere
 */
export function at(root, segments) {
  let node = root;
  for (const segment of segments) {
    const index = Array.isArray(node) && /^\d+$/.test(segment) ? Number(segment) : segment;
    const inside = Array.isArray(node) || isPlainObject(node);
    if (!inside || !isSafeKey(String(index)) || !Object.hasOwn(/** @type {object} */ (node), index)) {
      return undefined;
    }
    node = /** @type {any} */ (node)[index];
  }
  return node;
}

/**
 * A group with what it extends laid under it: local tokens and properties
 * replace inherited ones at the same path, groups at the same path merge.
 * @param {unknown} root - The whole file
 * @param {Record<string, any>} group
 * @param {(message: string) => void} report
 * @param {string[]} [seen] - The `$extends` followed to get here
 * @returns {Record<string, any>}
 */
export function extended(root, group, report, seen = []) {
  if (group.$extends === undefined) return group;
  const { $extends: ref, ...local } = group;
  const segments = refSegments(ref);
  const target = segments && at(root, segments);
  let why = '';
  if (!isPlainObject(target) || isToken(target)) why = 'does not name a group';
  else if (seen.includes(ref) || seen.length >= MAX_HOPS) why = 'leads back to itself';
  if (why) {
    report(`$extends ${JSON.stringify(ref)} ${why}`);
    return local;
  }
  const base = extended(root, /** @type {Record<string, any>} */ (target), report, [...seen, ref]);
  /** @type {Record<string, any>} */
  const merged = { ...base };
  for (const [key, value] of Object.entries(local)) {
    const both = isPlainObject(value) && isPlainObject(base[key]);
    const groups = both && !isToken(value) && !isToken(base[key]);
    merged[key] = groups ? { ...base[key], ...value } : value;
  }
  return merged;
}
