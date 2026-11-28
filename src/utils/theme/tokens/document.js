/**
 * Reading a Design Tokens file (format module 2025.10): its groups walked
 * into a flat list of tokens — each with its path, its type (its own, or
 * the nearest group's) and its value with every reference followed.
 * Nothing here knows about themes. Isomorphic and pure.
 * @module utils/theme/tokens/document
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { MAX_HOPS, at, extended, isToken, refSegments } from './refs.js';

/** Tokens read from one file, and how deep its groups may nest. */
export const MAX_TOKENS = 2000;
const MAX_DEPTH = 12;
const BAD_NAME = /^\$|[{}.]/;

/**
 * One token of a file.
 * @typedef {Object} FlatToken
 * @property {string} path - `group.name`
 * @property {string} type - '' when the file gives none
 * @property {unknown} value - References followed; undefined when one could not be
 */

/**
 * The value a token stands for, with every reference in it followed.
 * @param {unknown} root - The whole file
 * @param {unknown} token - A token object
 * @param {(message: string) => void} report
 * @param {number} [hops]
 * @returns {{ value: unknown, type: string }} `type`: the type the chain
 *   gives when the token has none of its own
 */
export function resolveToken(root, token, report, hops = 0) {
  const own = /** @type {Record<string, any>} */ (token);
  const type = typeof own.$type === 'string' ? own.$type : '';
  if (hops > MAX_HOPS) return (report('refers to itself in a circle'), { value: undefined, type });
  const ref = own.$ref ?? own.$value;
  const segments = '$ref' in own || /^\{.*\}$/.test(String(own.$value)) ? refSegments(ref) : null;
  if (!segments) return { value: deep(root, own.$value, report, hops), type };
  const target = at(root, segments);
  if (target === undefined) {
    return (report(`refers to ${JSON.stringify(ref)}, which is not there`), { value: undefined, type });
  }
  if (!isToken(target)) {
    // A pointer may name a value inside a token (`#/a/$value`); braces must name a token.
    if ('$ref' in own) return { value: deep(root, target, report, hops), type };
    return (report(`refers to ${JSON.stringify(ref)}, which is not a token`), { value: undefined, type });
  }
  const next = resolveToken(root, target, report, hops + 1);
  return { value: next.value, type: type || next.type };
}

/**
 * @param {unknown} root
 * @param {unknown} value - A token's value: `{ $ref }` objects anywhere inside it are followed
 * @param {(message: string) => void} report
 * @param {number} hops
 * @returns {unknown}
 */
function deep(root, value, report, hops) {
  if (Array.isArray(value)) return value.map((item) => deep(root, item, report, hops));
  if (!isPlainObject(value)) return value;
  const object = /** @type {Record<string, any>} */ (value);
  if (typeof object.$ref === 'string') return resolveToken(root, object, report, hops + 1).value;
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, deep(root, v, report, hops)]));
}

/**
 * Walk a Design Tokens file.
 * @param {unknown} doc - Parsed JSON
 * @returns {{ tokens: FlatToken[], problems: { path: string, message: string }[] }}
 */
export function readDocument(doc) {
  /** @type {FlatToken[]} */
  const tokens = [];
  /** @type {{ path: string, message: string }[]} */
  const problems = [];
  if (!isPlainObject(doc)) return { tokens, problems: [{ path: '', message: 'must be an object' }] };
  /** @type {(node: Record<string, any>, path: string[], type: string) => void} */
  const walk = (node, path, type) => {
    const here = path.join('.');
    const report = (/** @type {string} */ message) => void problems.push({ path: here, message });
    if (path.length > MAX_DEPTH || tokens.length >= MAX_TOKENS) return report('is nested too deep');
    const group = extended(doc, node, report);
    const inherited = typeof group.$type === 'string' ? group.$type : type;
    for (const [name, child] of Object.entries(group)) {
      const childPath = [...path, name].join('.');
      const note = (/** @type {string} */ message) => void problems.push({ path: childPath, message });
      if (name.startsWith('$') && name !== '$root') continue;
      if (!isPlainObject(child)) note('is neither a token nor a group');
      else if (name !== '$root' && BAD_NAME.test(name)) note('has a name with $, {, } or . in it');
      else if (isToken(child)) {
        const groupLike = Object.keys(child).some((key) => !key.startsWith('$'));
        if (groupLike) note('is a token and a group at once');
        const resolved = resolveToken(doc, child, note);
        tokens.push({ path: childPath, type: resolved.type || inherited, value: resolved.value });
      } else walk(child, [...path, name], inherited);
    }
  };
  walk(/** @type {Record<string, any>} */ (doc), [], '');
  return { tokens, problems };
}
