/**
 * Element items — the part of a plan that names a brand element instead of
 * inventing a look: "lower third: Ada Lovelace, CEO, at 0:12". An item says
 * WHICH element, WHAT fills its slots and, roughly, WHERE (with a pick of
 * the plan, or at a time); deterministic code decides the track, the exact
 * frame and the length. The schema checks the shape only: an element the
 * kit does not have is dropped and reported when the item is resolved.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Elements in a plan.
 * Isomorphic and pure.
 * @module utils/director/brand/items
 */

import { ROLES } from './elementClip.js';
import { clock, parseLine, splitSlots } from './line.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** Most element items a plan may hold. */
export const MAX_ITEMS = 40;

/** One element item of a plan. */
export const ITEM_SCHEMA = {
  type: 'object',
  required: ['element'],
  properties: {
    element: { type: 'string', minLength: 1, maxLength: 60 },
    slots: { type: 'object', additionalProperties: { type: 'string', maxLength: 2000 } },
    line: { type: 'string', maxLength: 2000 },
    at: { type: 'number', minimum: 0 },
    pick: { type: 'integer', minimum: 1 },
    duration: { type: 'number', exclusiveMinimum: 0, maximum: 600 },
  },
};

/** A valid item, shown to a language model and used in the docs. */
export const ITEM_EXAMPLE = {
  element: 'lower-third',
  slots: { name: 'Ada Lovelace', role: 'Park ranger' },
  pick: 1,
};

/** Other words for an element, by the role it plays. */
const WORDS = {
  lowerThird: ['lower third', 'name', 'name plate', 'name caption', 'super', 'speaker'],
  title: ['heading', 'headline'],
  captions: ['caption', 'subtitle'],
  chapter: ['chapter card', 'section', 'section card'],
  intro: ['opening', 'opener', 'bumper'],
  outro: ['closing', 'end card', 'ending', 'credits'],
  bug: ['logo', 'logo bug', 'watermark'],
  transition: ['transition', 'wipe', 'logo wipe', 'sting'],
};

const plain = (/** @type {unknown} */ name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * The element of a kit a name means: its id, its label, the role it plays
 * in the kit's `defaults`, or a common word for that role.
 * @param {Kit} kit - An effective kit
 * @param {unknown} name
 * @returns {string} An element id; '' when the kit has nothing by that name
 */
export function findElement(kit, name) {
  const elements = kit?.elements || {};
  const wanted = plain(name);
  if (!wanted) return '';
  const ids = Object.keys(elements);
  const direct =
    ids.find((id) => plain(id) === wanted) ||
    ids.find((id) => plain(elements[id].label) === wanted);
  if (direct) return direct;
  const role = Object.keys(ROLES).find(
    (key) => plain(key) === wanted || (WORDS[key] || []).some((word) => plain(word) === wanted),
  );
  const id = role ? kit.defaults?.[role] || ROLES[role] : '';
  return id && Object.hasOwn(elements, id) ? id : '';
}

/**
 * The elements of a kit as a list a prompt or a form can show.
 * @param {Kit} kit
 * @returns {{ id: string, label: string, kind: string, slots: string[], needs: string[] }[]} `needs`:
 *   the slots that must be filled
 */
export function kitMenu(kit) {
  return Object.entries(kit?.elements || {}).map(([id, element]) => {
    const slots = Object.keys(element.slots || {});
    const needs = slots.filter((name) => !element.slots[name]?.optional);
    return { id, label: element.label || id, kind: element.kind || 'overlay', slots, needs };
  });
}

const KEYS = {
  element: ['element', 'type', 'kind', 'name', 'id'],
  at: ['at', 'time', 'start', 'when'],
  pick: ['pick', 'over', 'on', 'with'],
  duration: ['duration', 'length', 'seconds'],
};
const KNOWN = [...Object.values(KEYS).flat(), 'slots', 'line'];

/**
 * Bring an item into shape: a line as a person writes one, or an object
 * with whatever keys a language model chose. Nothing is judged here.
 * @param {unknown} raw
 * @returns {any} An item for `ITEM_SCHEMA` to check; anything else as it came
 */
export function normalizeItem(raw) {
  if (typeof raw === 'string') {
    const read = parseLine(raw);
    if (!read) return raw;
    return { element: read.name, line: read.rest, ...(read.at !== null && { at: read.at }) };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const given = /** @type {Record<string, any>} */ (raw);
  /** @type {Record<string, any>} */
  const item = {};
  for (const [key, aliases] of Object.entries(KEYS)) {
    const alias = aliases.find(
      (a) => given[a] !== undefined && given[a] !== null && given[a] !== '',
    );
    if (alias) item[key] = given[alias];
  }
  if (typeof item.element === 'string') item.element = item.element.trim().slice(0, 60);
  if (item.at !== undefined) item.at = clock(item.at) ?? item.at;
  if (typeof item.pick === 'string' && /^\D*\d+$/.test(item.pick.trim())) {
    item.pick = Number(item.pick.replace(/\D+/g, ''));
  }
  if (item.duration !== undefined) item.duration = clock(item.duration) ?? item.duration;
  // Slots may be written flat, beside the item's own fields.
  const flat = Object.entries(given).filter(([key]) => !KNOWN.includes(key));
  const slots = given.slots && typeof given.slots === 'object' ? given.slots : null;
  const texts = Object.entries(slots || Object.fromEntries(flat))
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => [key, String(value).trim().slice(0, 2000)]);
  if (texts.length) item.slots = Object.fromEntries(texts);
  if (typeof given.line === 'string') item.line = given.line.slice(0, 2000);
  return item;
}

/**
 * What an item means in a kit.
 * @param {any} item - Valid against `ITEM_SCHEMA`
 * @param {Kit} kit
 * @returns {{ id: string, kind: string, label: string, slots: Record<string, string>,
 *   at: number|null, pick: number|null, duration: number|null }|null} null
 *   when the kit has no element by that name
 */
export function resolveItem(item, kit) {
  const id = findElement(kit, item?.element);
  if (!id) return null;
  const element = kit.elements[id];
  const names = Object.keys(element.slots || {});
  const written = splitSlots(item.line || '', names);
  const given = Object.fromEntries(
    Object.entries(item.slots || {}).filter(([name]) => names.includes(name)),
  );
  return {
    id,
    kind: element.kind || 'overlay',
    label: element.label || id,
    slots: { ...written, ...given },
    at: Number.isFinite(item.at) ? item.at : null,
    pick: Number.isInteger(item.pick) ? item.pick : null,
    duration: item.duration > 0 ? item.duration : null,
  };
}
