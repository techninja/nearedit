/**
 * Element clips — clips that are an instance of a brand element
 * (docs/app-spec/BRAND.md). An element clip carries `element: { kit, id,
 * slots, design }`: the design is the element with the kit's tokens filled
 * in, so the document draws with no kit at hand; `kit.key` is the revision
 * of the kit it came from. Inside is the brand's — replaced by `restyle`;
 * outside (where it sits, how long it lasts, fades, transform, effects,
 * keyframes) is the editor's and is never touched by these operations.
 * Its source is unbounded, like a title's. Isomorphic and pure.
 * @module utils/edl/elementClip
 */

import { isElementClip } from '#utils/brand/clip.js';
import { resolveElement } from '#utils/brand/element/resolve.js';
import { cleanSlots } from '#utils/brand/field.js';
import { kitKey } from '#utils/brand/key.js';
import { elementLabel, newElementClip, placeElement } from './elementInsert.js';
import { syncFonts } from './elementFonts.js';
import { changeClip, idList, mapClips } from './immutable.js';
import { sameJson } from './jsonBag.js';
import { allClips } from './query.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').ClipRef} ClipRef */
/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/**
 * Add an element clip: an instance of one element of a kit with its slots
 * filled in. Where it goes follows the element's kind — an **overlay** is
 * placed like a title (on the front-most video track when that is free in
 * its span, otherwise on a new track on top); a **segment** takes its own
 * time: a gap as long as it is opened at `time` on every unlocked track and
 * the clip goes on the main video track (`ripple: false` lays it over the
 * picture instead); a **transition** is centred on the cut nearest to
 * `time`, the moment it covers the frame on the cut. The document's `fonts`
 * table gets the font files the design needs. Find the clip with
 * `newClipIds(before, after)`.
 * @param {Edl} edl
 * @param {Kit} kit - An effective kit (`resolveKit`)
 * @param {string} elementId
 * @param {Record<string, string>} [slots] - Text by slot name; slots the
 *   element does not have are left out
 * @param {{ time?: number, duration?: number, trackId?: string, ripple?: boolean,
 *   autoCrossfade?: boolean, label?: string }} [opts] - `time` default 0;
 *   `duration` default: the element's own
 * @returns {Edl} Unchanged when the kit has no such element
 */
export function insertElement(edl, kit, elementId, slots, opts = {}) {
  const design = resolveElement(kit, elementId);
  if (!design) return edl;
  const given = cleanSlots(slots);
  const kept = Object.fromEntries(
    design.slots.flatMap((name) => (name in given ? [[name, given[name]]] : [])),
  );
  const element = {
    kit: { id: kit.id || '', key: kitKey(kit) },
    id: elementId,
    slots: kept,
    design,
  };
  const clip = newElementClip(edl, element, kit.elements[elementId]?.label, opts);
  return syncFonts(placeElement(edl, clip, opts));
}

/**
 * Change what is filled into an element clip's slots: the patch is merged
 * in, slot by slot. The design, and everything outside it, stays; a label
 * that was the clip's own first slot follows the new text.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {Record<string, string>} slots - Slot name → text ('' empties one)
 * @returns {Edl} Unchanged for a clip that is not an element clip, a clip
 *   on a locked track, and a patch that says what is already there
 */
export function updateElementSlots(edl, clipId, slots) {
  return changeClip(edl, clipId, (clip) => {
    if (!isElementClip(clip)) return clip;
    const merged = { ...clip.element.slots, ...cleanSlots(slots) };
    if (sameJson(merged, clip.element.slots)) return clip;
    const element = { ...clip.element, slots: merged };
    const own = clip.label === elementLabel(clip.element, clip.label);
    return { ...clip, element, label: own ? elementLabel(element, clip.label) : clip.label };
  });
}

/**
 * Bring element clips up to date with a kit: each gets the design of its
 * element as that kit defines it now, and the kit's id and key. Slots are
 * kept — one the new element no longer has stays in the block, unused —
 * and nothing outside the `element` block changes: not the clip's place,
 * length, fades, transform, effects or keyframes. A clip whose element the
 * kit no longer has is left as it is (`staleElements` reports it). The
 * `fonts` table follows the new designs.
 * @param {Edl} edl
 * @param {Kit} kit - An effective kit (`resolveKit`)
 * @param {Iterable<string>|string} [clipIds] - Default: every element clip
 * @returns {Edl} Unchanged when every clip named is already up to date
 */
export function restyle(edl, kit, clipIds) {
  const only = clipIds === undefined ? null : new Set(idList(clipIds));
  const key = kitKey(kit);
  /** @type {any[]} */
  const dropped = [];
  const next = mapClips(edl, (clip) => {
    if (!isElementClip(clip) || (only && !only.has(clip.clipId))) return clip;
    const design = resolveElement(kit, clip.element.id);
    if (!design) return clip;
    const { element } = clip;
    const fresh = element.kit.key === key && element.kit.id === (kit.id || '');
    if (fresh && sameJson(element.design, design)) return clip;
    dropped.push(...(element.design.fonts || []));
    return { ...clip, element: { ...element, kit: { id: kit.id || '', key }, design } };
  });
  return syncFonts(next, dropped);
}

/**
 * @param {Edl} edl
 * @returns {ClipRef[]} Every element clip with its track, in track then time order
 */
export function elementClips(edl) {
  return allClips(edl).filter(({ clip }) => isElementClip(clip));
}

/**
 * The element clips that are out of date with a kit: made from another
 * revision of it or from another kit (`outdated` — `restyle` brings them up
 * to date), or instances of an element the kit does not have (`missing` —
 * `restyle` leaves them alone).
 * @param {Edl} edl
 * @param {Kit} kit - An effective kit (`resolveKit`)
 * @returns {(ClipRef & { reason: 'outdated'|'missing' })[]}
 */
export function staleElements(edl, kit) {
  const key = kitKey(kit);
  /** @type {(ClipRef & { reason: 'outdated'|'missing' })[]} */
  const stale = [];
  for (const ref of elementClips(edl)) {
    const { element } = ref.clip;
    if (!Object.hasOwn(kit?.elements || {}, element.id)) stale.push({ ...ref, reason: 'missing' });
    else if (element.kit.key !== key) stale.push({ ...ref, reason: 'outdated' });
  }
  return stale;
}
