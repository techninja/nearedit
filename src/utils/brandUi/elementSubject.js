/**
 * What the inspector's Brand element group shows for a selection: the
 * element clips among the selected clips, which element of which kit they
 * are, their blanks as fields — with several clips, the blanks they share,
 * a value they disagree on shown as mixed — and how they stand with the
 * project's kit. Pure and isomorphic.
 * @module utils/brandUi/elementSubject
 */

import { BUILTIN_KITS } from '#utils/brand/index.js';
import { elementName } from '#utils/timeline/clipMarksElement.js';
import { slotSpecs } from './elementList.js';

/** @typedef {import('#utils/inspector/targets.js').SelectedClip} SelectedClip */
/** @typedef {import('./elementList.js').SlotSpec} SlotSpec */

/**
 * One blank as a field.
 * @typedef {SlotSpec & { value: string, mixed: boolean }} SlotField
 */

/**
 * @typedef {Object} ElementSubject
 * @property {SelectedClip[]} refs - The element clips of the selection
 * @property {string[]} clipIds
 * @property {boolean} locked - One of them is on a locked track: nothing can be changed
 * @property {string} what - `Lower third`, or `3 brand elements`
 * @property {string} from - The kit they were made from, by name
 * @property {SlotField[]} fields - The blanks every one of them has
 * @property {string[]} outdated - Those an update would change
 * @property {string[]} missing - Those whose element the project's kit does not have
 */

/**
 * @param {string} id - A kit's id as a clip remembers it
 * @param {{ id?: string, name?: string }|null|undefined} kit - The project's kit
 * @returns {string} The kit's name where it is known
 */
export function kitLabel(id, kit) {
  if (id && id === kit?.id) return kit.name || id;
  return BUILTIN_KITS.find((entry) => entry.id === id)?.name || id || 'a kit without a name';
}

/**
 * @param {SelectedClip[]} refs - The selected clips (`inspectorModel().refs`)
 * @param {import('#utils/brand/types.js').Kit|null|undefined} kit - The project's kit
 * @param {Map<string, 'outdated'|'missing'>} stale - `staleInfo().byClip`
 * @returns {ElementSubject|null} null when no element clip is selected
 */
export function elementSubject(refs, kit, stale) {
  const mine = (refs || []).filter((ref) => ref.kind === 'element');
  if (!mine.length) return null;
  const blocks = mine.map((ref) => ref.clip.element);
  const [first] = blocks;
  const shared = (first.design.slots || []).filter((name) =>
    blocks.every((block) => (block.design.slots || []).includes(name)),
  );
  const fields = slotSpecs(kit, first.id, shared).map((spec) => {
    const values = blocks.map((block) => block.slots?.[spec.name] ?? '');
    const mixed = values.some((value) => value !== values[0]);
    return { ...spec, value: mixed ? '' : values[0], mixed };
  });
  const same = blocks.every((block) => block.id === first.id);
  const kits = [...new Set(blocks.map((block) => kitLabel(block.kit?.id, kit)))];
  const ids = mine.map((ref) => ref.clip.clipId);
  return {
    refs: mine,
    clipIds: ids,
    locked: mine.some((ref) => ref.track.locked),
    what:
      same && mine.length === 1 ? elementName(mine[0].clip, kit) : `${mine.length} brand elements`,
    from: kits.length === 1 ? kits[0] : 'several kits',
    fields,
    outdated: ids.filter((id) => stale.get(id) === 'outdated'),
    missing: ids.filter((id) => stale.get(id) === 'missing'),
  };
}
