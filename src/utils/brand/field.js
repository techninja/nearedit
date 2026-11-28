/**
 * The `element` field of a clip as data: reading it from a loaded document
 * and checking it. A clip has an `element` block only when it is an element
 * clip — every other clip has no such field. Isomorphic and pure.
 * Contract: docs/app-spec/EDL.md § element.
 * @module utils/brand/field
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { firstDifference } from '#utils/music/field.js';
import { normalizeDesign } from './element/normalize.js';
import { KEY_PATTERN } from './key.js';
import { LIMITS, isId } from './limits.js';

/** @typedef {import('./types.js').ElementBlock} ElementBlock */
/** @typedef {(path: string, message: string) => void} Report */

/** Slots a block may hold: those of its element, and those of an earlier one. */
const MAX_SLOTS = LIMITS.slots * 2;

/**
 * Read what is filled into the slots of an element: text by slot name.
 * @param {any} raw
 * @returns {Record<string, string>}
 */
export function cleanSlots(raw) {
  /** @type {Record<string, string>} */
  const slots = {};
  if (!isPlainObject(raw)) return slots;
  for (const name of Object.keys(raw).filter(isId).slice(0, MAX_SLOTS)) {
    const value = typeof raw[name] === 'number' ? String(raw[name]) : raw[name];
    if (typeof value === 'string') slots[name] = value.slice(0, LIMITS.slotText);
  }
  return slots;
}

/**
 * Read an `element` block. The design is read as `normalizeDesign` reads it
 * — only what the element language knows, every list cut to its limit —
 * the kit's id and key are kept when they look like one.
 * @param {any} raw
 * @returns {ElementBlock|null} null for anything without a design object
 */
export function cleanElement(raw) {
  if (!isPlainObject(raw) || !Object.hasOwn(raw, 'design')) return null;
  const design = normalizeDesign(raw.design);
  if (!design) return null;
  const kit = isPlainObject(raw.kit) ? raw.kit : {};
  return {
    kit: {
      id: isId(kit.id) ? kit.id : '',
      key: typeof kit.key === 'string' && KEY_PATTERN.test(kit.key) ? kit.key : '',
    },
    id: isId(raw.id) ? raw.id : '',
    slots: cleanSlots(raw.slots),
    design,
  };
}

/**
 * Check a clip's `element` field for `validateEdl`: absent, or exactly what
 * `cleanElement` produces. Whether the design draws anything sensible is
 * `validateDesign`'s question, not the document's.
 * @param {any} element
 * @param {string} path - Path of the field, e.g. `tracks[0].clips[2].element`
 * @param {Report} report
 */
export function checkElement(element, path, report) {
  if (element === undefined) return;
  const clean = cleanElement(element);
  if (!clean) return report(path, 'must be an object with a design');
  const at = firstDifference(element, clean, path);
  if (at !== null) report(at, 'is not what an element block holds (see cleanElement)');
}
