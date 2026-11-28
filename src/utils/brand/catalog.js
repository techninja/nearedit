/**
 * What the built-in kits offer, as data: each kit with its elements, and
 * each element with its kind, its length and its slots. The command line
 * prints it, a director is told what it may name from it.
 * Isomorphic and pure.
 * @module utils/brand/catalog
 */

import { BUILTIN_KITS, builtinKit } from './kits/index.js';
import { BUILTIN_PREFIX } from './limits.js';

/**
 * @typedef {Object} ElementEntry
 * @property {string} id
 * @property {string} label
 * @property {string} kind - overlay | segment | transition
 * @property {number} duration - Seconds it lasts when placed
 * @property {{ name: string, label: string, optional: boolean }[]} slots
 */

/**
 * The elements of a kit, as data.
 * @param {import('./types.js').Kit} kit - A kit, or an effective kit
 * @returns {ElementEntry[]}
 */
export function kitElements(kit) {
  return Object.entries(kit?.elements || {}).map(([id, element]) => ({
    id,
    label: element.label || id,
    kind: element.kind,
    duration: element.duration ?? 5,
    slots: Object.entries(element.slots || {}).map(([name, slot]) => ({
      name,
      label: slot.label || name,
      optional: slot.optional === true,
    })),
  }));
}

/**
 * The built-in kits with their elements, as one JSON-safe list.
 * @returns {{ id: string, name: string, description: string, extends: string,
 *   elements: ElementEntry[] }[]} `extends`: what a kit of your own writes
 *   to build on it
 */
export function brandCatalog() {
  return BUILTIN_KITS.map(({ id, name, description }) => ({
    id,
    name,
    description,
    extends: `${BUILTIN_PREFIX}${id}`,
    elements: kitElements(builtinKit(id)),
  }));
}
