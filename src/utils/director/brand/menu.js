/**
 * The elements of a kit by name: which element a word means — its id, its
 * label, the role it plays in the kit's `defaults`, or a common word for
 * that role — and the kit's elements as a list a prompt or a form can show.
 * Isomorphic and pure.
 * @module utils/director/brand/menu
 */

import { ROLES } from './elementClip.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

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
  const exact = String(name).trim();
  if (Object.hasOwn(elements, exact)) return exact;
  // A role, by its name or a word for it: the element the kit uses in that role.
  const role = Object.keys(ROLES).find(
    (key) =>
      [key, ROLES[key], ...(WORDS[key] || [])].some((word) => plain(word) === wanted) &&
      Object.hasOwn(elements, kit.defaults?.[key] || ROLES[key]),
  );
  if (role) return kit.defaults?.[role] || ROLES[role];
  return (
    ids.find((id) => plain(id) === wanted) ||
    ids.find((id) => plain(elements[id].label) === wanted) ||
    ''
  );
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
