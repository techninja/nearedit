/**
 * Which element clips are out of date with the project's kit, and bringing
 * them up to date. A clip is **outdated** when its design was made from
 * another revision of the kit (or from another kit) — "Update to brand"
 * replaces its design and keeps what was filled in — and **missing** when
 * the kit has no such element, which an update leaves alone. The answer is
 * kept per document and kit: documents are never changed in place.
 * @module utils/brandUi/stale
 */

import { restyle, staleElements } from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { currentKit } from './kitState.js';

/**
 * @typedef {Object} StaleInfo
 * @property {Map<string, 'outdated'|'missing'>} byClip - Every stale clip
 * @property {string[]} outdated - Clips an update would change (not on a locked track)
 * @property {string[]} locked - Outdated clips on locked tracks
 * @property {string[]} missing - Clips whose element the kit does not have
 */

/** @type {WeakMap<object, { kit: object, info: StaleInfo }>} */
const known = new WeakMap();

/** @type {StaleInfo} */
const NONE = { byClip: new Map(), outdated: [], locked: [], missing: [] };

/**
 * @param {any} [doc] - Default: the open document
 * @param {import('#utils/brand/types.js').Kit} [kit] - Default: the project's kit
 * @returns {StaleInfo}
 */
export function staleInfo(doc = getDoc(), kit = currentKit()) {
  if (!doc || typeof doc !== 'object' || !kit) return NONE;
  const kept = known.get(doc);
  if (kept?.kit === kit) return kept.info;
  /** @type {StaleInfo} */
  const info = { byClip: new Map(), outdated: [], locked: [], missing: [] };
  for (const { clip, track, reason } of staleElements(doc, kit)) {
    info.byClip.set(clip.clipId, reason);
    if (reason === 'missing') info.missing.push(clip.clipId);
    else (track.locked ? info.locked : info.outdated).push(clip.clipId);
  }
  known.set(doc, { kit, info });
  return info;
}

/**
 * @param {string} clipId
 * @returns {''|'outdated'|'missing'} What the clip lacks of the project's kit; '' when it is current
 */
export const staleReason = (clipId) => staleInfo().byClip.get(clipId) || '';

/**
 * Bring element clips up to date with the project's kit: one undo step.
 * @param {Iterable<string>} [clipIds] - Default: every element clip
 * @returns {number} How many clips changed
 */
export function updateToBrand(clipIds) {
  const kit = currentKit();
  const before = staleInfo(getDoc(), kit).outdated.length;
  if (!edit((doc) => restyle(doc, kit, clipIds))) return 0;
  return before - staleInfo(getDoc(), kit).outdated.length;
}

/**
 * @param {number} count
 * @returns {string} `1 element`, `3 elements`
 */
export const elementsWord = (count) => `${count} ${count === 1 ? 'element' : 'elements'}`;
