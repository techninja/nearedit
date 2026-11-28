/**
 * A kit's elements as the Create tab and the inspector show them: grouped
 * by what they do on a timeline — overlays, segments, transitions — each
 * with its blanks (label, whether it may stay empty, how many lines, the
 * sample a thumbnail shows). Pure and isomorphic.
 * @module utils/brandUi/elementList
 */

import { wordsOf } from '#utils/timeline/clipMarksElement.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/**
 * One blank of an element, for a form.
 * @typedef {Object} SlotSpec
 * @property {string} name
 * @property {string} label
 * @property {boolean} optional
 * @property {number} lines - Lines a form shows for it
 * @property {number} max - Longest text, characters; 0 = no limit of its own
 * @property {string} sample - What a thumbnail shows
 */

/**
 * @typedef {Object} ElementItem
 * @property {string} id
 * @property {string} label
 * @property {'overlay'|'segment'|'transition'} kind
 * @property {number} duration - Seconds it lasts when placed
 * @property {SlotSpec[]} slots
 * @property {string} description - What adding it does
 */

/** The kinds, in the order the Create tab lists them, and what each does when added. */
export const ELEMENT_KINDS = Object.freeze([
  { kind: 'overlay', label: 'Overlays', does: 'goes over the picture at the edit cursor' },
  { kind: 'segment', label: 'Segments', does: 'takes its own time: the timeline opens for it' },
  { kind: 'transition', label: 'Transitions', does: 'is centred on the nearest cut' },
]);

/**
 * The blanks of an element. Labels and limits come from the kit when it
 * still has the element; a design alone knows only the names.
 * @param {Kit|null|undefined} kit
 * @param {string} elementId
 * @param {string[]} [names] - The slot names of a design; default: the kit's
 * @returns {SlotSpec[]}
 */
export function slotSpecs(kit, elementId, names) {
  const known =
    kit?.elements && Object.hasOwn(kit.elements, elementId) ? kit.elements[elementId].slots : {};
  return (names || Object.keys(known || {})).map((name) => {
    const slot = (known && Object.hasOwn(known, name) && known[name]) || {};
    return {
      name,
      label: slot.label || wordsOf(name),
      optional: slot.optional === true,
      lines: slot.lines > 1 ? Math.min(8, Math.round(slot.lines)) : 1,
      max: slot.max > 0 ? Math.round(slot.max) : 0,
      sample: slot.sample || slot.label || wordsOf(name),
    };
  });
}

/**
 * @param {SlotSpec[]} slots
 * @returns {Record<string, string>} Every blank filled with its sample (a thumbnail)
 */
export const sampleSlots = (slots) =>
  Object.fromEntries(slots.map((slot) => [slot.name, slot.sample]));

/**
 * What a new clip starts with: each blank that must be filled says what
 * belongs there (its label), so the element shows in its look at once and
 * nobody mistakes it for finished; blanks that may stay empty are empty.
 * @param {SlotSpec[]} slots
 * @returns {Record<string, string>}
 */
export const starterSlots = (slots) =>
  Object.fromEntries(slots.filter((slot) => !slot.optional).map((slot) => [slot.name, slot.label]));

/**
 * @param {Kit|null|undefined} kit
 * @returns {ElementItem[]} The kit's elements, in the kit's order
 */
export function elementItems(kit) {
  return Object.entries(kit?.elements || {}).map(([id, element]) => {
    const kind = ELEMENT_KINDS.find((entry) => entry.kind === element.kind) || ELEMENT_KINDS[0];
    const label = element.label || wordsOf(id);
    return {
      id,
      label,
      kind: /** @type {ElementItem['kind']} */ (kind.kind),
      duration: element.duration > 0 ? element.duration : 5,
      slots: slotSpecs(kit, id),
      description: `${label} ${kind.does}`,
    };
  });
}

/**
 * @param {Kit|null|undefined} kit
 * @returns {{ kind: string, label: string, items: ElementItem[] }[]} The
 *   kinds that have elements, each with its elements
 */
export function elementGroups(kit) {
  const items = elementItems(kit);
  return ELEMENT_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length);
}
