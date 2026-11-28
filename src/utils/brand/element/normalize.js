/**
 * Reading an element out of a kit file, and a design out of a clip. Both
 * come from outside — hand-written JSON, a language model, another
 * machine — so only what the language knows is kept, lists are cut to
 * their limits and nothing is ever executed. Nothing is filled in: an
 * element stores only what it says. Isomorphic and pure.
 * @module utils/brand/element/normalize
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS, isId } from '#utils/brand/limits.js';
import { cleanFonts } from '#utils/brand/fontTable.js';
import { GROUP_FIELDS, LAYER_FIELDS, readShape } from './fields.js';
import { FORMATS, KINDS } from './vocabulary.js';

/** @typedef {import('#utils/brand/types.js').Element} Element */
/** @typedef {import('#utils/brand/types.js').Design} Design */

const HEAD = { margin: 'num', cover: 'num', duration: 'num', minDuration: 'num' };
const MOTION = { by: 'by', ease: 'ease', speed: 'num' };
const SLOT = { label: 'text', sample: 'text', optional: 'bool', lines: 'num', max: 'num' };

/**
 * @param {any} raw
 * @param {Record<string, string>} fields
 * @param {number} limit
 * @returns {Record<string, Record<string, any>>} The entries with a usable id
 */
function readMap(raw, fields, limit) {
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const id of Object.keys(raw).filter(isId)) {
    if (Object.keys(out).length >= limit) break;
    const entry = readShape(raw[id], fields);
    if (entry) out[id] = entry;
  }
  return out;
}

/**
 * @param {any} raw
 * @returns {Record<string, any>[]} The layers that say what they are
 */
function readLayers(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, LIMITS.layers) : [];
  return list.map((layer) => readShape(layer, LAYER_FIELDS)).filter((layer) => layer?.type);
}

/**
 * @param {any} raw
 * @returns {Record<string, any>} Per-format adjustments, by format
 */
function readFormats(raw) {
  /** @type {Record<string, any>} */
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const format of FORMATS.filter((name) => isPlainObject(raw[name]))) {
    const { type: _type, id: _id, ...patch } = LAYER_FIELDS;
    const layers = readMap(raw[format].layers, patch, LIMITS.layers);
    const groups = readMap(raw[format].groups, GROUP_FIELDS, LIMITS.groups);
    const head = readShape(raw[format], { margin: 'num' });
    out[format] = {
      ...head,
      ...(Object.keys(groups).length && { groups }),
      ...(Object.keys(layers).length && { layers }),
    };
  }
  return out;
}

/**
 * What an element and a design share: kind, timing, groups, layers, formats.
 * @param {Record<string, any>} raw - A plain object
 * @returns {Record<string, any>}
 */
function readBody(raw) {
  const groups = readMap(raw.groups, GROUP_FIELDS, LIMITS.groups);
  const formats = readFormats(raw.formats);
  return {
    kind: KINDS.includes(raw.kind) ? raw.kind : 'overlay',
    ...readShape(raw, HEAD),
    ...(Object.keys(groups).length && { groups }),
    layers: readLayers(raw.layers),
    ...(Object.keys(formats).length && { formats }),
  };
}

/**
 * Read an element as a kit defines it.
 * @param {any} raw
 * @returns {Element|null} null for anything that is not an object
 */
export function normalizeElement(raw) {
  if (!isPlainObject(raw)) return null;
  const label = typeof raw.label === 'string' ? raw.label.slice(0, LIMITS.name) : '';
  const slots = readMap(raw.slots, SLOT, LIMITS.slots);
  return /** @type {Element} */ ({ label, ...readBody(raw), slots });
}

/**
 * Read a design: an element with its tokens filled in, as a clip carries it.
 * @param {any} raw
 * @returns {Design|null} null for anything that is not an object
 */
export function normalizeDesign(raw) {
  if (!isPlainObject(raw)) return null;
  const names = Array.isArray(raw.slots) ? raw.slots : [];
  const slots = names.filter(isId).slice(0, LIMITS.slots);
  const motion = readShape(raw.motion, MOTION);
  const fonts = cleanFonts(raw.fonts);
  return /** @type {Design} */ ({
    ...readBody(raw),
    slots: [...new Set(slots)],
    ...(motion && Object.keys(motion).length && { motion }),
    ...(fonts.length && { fonts }),
  });
}
