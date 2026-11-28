/**
 * Reading a kit out of whatever a `kit.json` holds — hand-written JSON, a
 * language model's answer, a file from another machine. Only what a kit
 * has is kept: tokens the schema knows, with usable values; font files;
 * elements in the element language; defaults. Nothing is filled in — a kit
 * says what it changes and inherits the rest (`resolveKit`).
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/normalize
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { normalizeElement } from './element/normalize.js';
import { cleanFonts } from './fontTable.js';
import { BUILTIN_PREFIX, LIMITS, isId } from './limits.js';
import { cleanTokens } from './tokenClean.js';

/** @typedef {import('./types.js').Kit} Kit */

/**
 * @param {any} value
 * @returns {string} What a kit extends: an id, `builtin:<id>`, or ''
 */
function parentOf(value) {
  if (typeof value !== 'string') return '';
  const id = value.startsWith(BUILTIN_PREFIX) ? value.slice(BUILTIN_PREFIX.length) : value;
  return isId(id) ? value : '';
}

/**
 * @param {any} raw
 * @returns {Record<string, import('./types.js').Element>} The elements with a usable id
 */
function readElements(raw) {
  /** @type {Record<string, import('./types.js').Element>} */
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const id of Object.keys(raw).filter(isId).slice(0, LIMITS.elements)) {
    const element = normalizeElement(raw[id]);
    if (element) out[id] = element;
  }
  return out;
}

/**
 * @param {any} raw
 * @returns {Record<string, string>} Role → element id
 */
function readDefaults(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const role of Object.keys(raw).filter(isId).slice(0, LIMITS.defaults)) {
    if (isId(raw[role])) out[role] = raw[role];
  }
  return out;
}

/**
 * Normalise a kit.
 * @param {any} raw
 * @returns {Kit} Always a kit: `{}` and garbage give an empty one, which
 *   inherits everything
 */
export function normalizeKit(raw) {
  const kit = isPlainObject(raw) ? raw : {};
  return {
    id: isId(kit.id) ? kit.id : '',
    name: typeof kit.name === 'string' ? kit.name.slice(0, LIMITS.name) : '',
    extends: parentOf(kit.extends),
    tokens: cleanTokens(kit.tokens),
    fonts: cleanFonts(kit.fonts),
    elements: readElements(kit.elements),
    defaults: readDefaults(kit.defaults),
  };
}
