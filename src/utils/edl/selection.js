/**
 * Selection helpers: linked/grouped expansion, grouping, linking and
 * marquee queries. Clips on locked tracks cannot be selected, so they are
 * never returned and never changed. Isomorphic and pure.
 * @module utils/edl/selection
 */

import { newId } from './factory.js';
import { allClips } from './query.js';
import { idList, indexClips, mapClips } from './immutable.js';
import { applyLinks } from './links.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Grow a selection to everything that must travel with it: linked A/V
 * partners and clips sharing a groupId (transitively).
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {{ linked?: boolean, grouped?: boolean }} [opts] - Both default true
 * @returns {string[]} Existing, unlocked clip ids; the given ones first
 */
export function expandSelection(edl, clipIds, opts = {}) {
  const { linked = true, grouped = true } = opts;
  const index = indexClips(edl);
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const { clip } of grouped ? index.values() : []) {
    if (clip.groupId) groups.set(clip.groupId, [...(groups.get(clip.groupId) || []), clip.clipId]);
  }
  /** @type {Set<string>} */
  const out = new Set();
  const queue = idList(clipIds);
  while (queue.length) {
    const ref = index.get(queue.shift());
    if (!ref || ref.track.locked || out.has(ref.clip.clipId)) continue;
    out.add(ref.clip.clipId);
    if (linked && ref.clip.linkedClipId) queue.push(ref.clip.linkedClipId);
    if (grouped && ref.clip.groupId) queue.push(...groups.get(ref.clip.groupId));
  }
  return [...out];
}

/**
 * Put clips in one new group so they move together.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @returns {Edl} Unchanged when fewer than two unlocked clips are given
 */
export function groupClips(edl, clipIds) {
  const ids = new Set(expandSelection(edl, clipIds, { linked: false, grouped: false }));
  if (ids.size < 2) return edl;
  const groupId = newId('grp');
  return mapClips(edl, (clip) => (ids.has(clip.clipId) ? { ...clip, groupId } : clip));
}

/**
 * Dissolve every group that one of the given clips belongs to.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @returns {Edl}
 */
export function ungroupClips(edl, clipIds) {
  const ids = new Set(idList(clipIds));
  const groups = new Set(
    allClips(edl)
      .filter(({ clip }) => clip.groupId && ids.has(clip.clipId))
      .map(({ clip }) => clip.groupId),
  );
  return mapClips(edl, (clip) => (groups.has(clip.groupId) ? { ...clip, groupId: '' } : clip));
}

/**
 * Link two clips as A/V partners. Whatever either was linked to is released.
 * @param {Edl} edl
 * @param {string} clipIdA
 * @param {string} clipIdB
 * @returns {Edl} Unchanged when a clip is missing, locked, or both are the same
 */
export function linkClips(edl, clipIdA, clipIdB) {
  const index = indexClips(edl);
  const a = index.get(clipIdA);
  const b = index.get(clipIdB);
  if (!a || !b || a === b || a.track.locked || b.track.locked) return edl;
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const { clip } of [a, b]) if (clip.linkedClipId) links.set(clip.linkedClipId, '');
  return applyLinks(edl, links.set(clipIdA, clipIdB).set(clipIdB, clipIdA));
}

/**
 * Break the link of each given clip (and of its partner).
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @returns {Edl}
 */
export function unlinkClips(edl, clipIds) {
  const index = indexClips(edl);
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const id of idList(clipIds)) {
    const ref = index.get(id);
    if (!ref || ref.track.locked || !ref.clip.linkedClipId) continue;
    links.set(id, '').set(ref.clip.linkedClipId, '');
  }
  return applyLinks(edl, links);
}

/**
 * Clips that intersect a time range — marquee selection. A zero-width range
 * selects what is under that time.
 * @param {Edl} edl
 * @param {number} start
 * @param {number} end
 * @param {Iterable<string>} [trackIds] - Limit to these tracks; all by default
 * @returns {string[]} clipIds in track then time order (locked tracks skipped)
 */
export function clipsInRange(edl, start, end, trackIds) {
  const only = trackIds ? new Set(idList(trackIds)) : null;
  const from = Math.min(start, end);
  const to = Math.max(start, end, from + 2 * EPS);
  return allClips(edl)
    .filter(({ track }) => !track.locked && (!only || only.has(track.trackId)))
    .filter(({ clip }) => clip.timelineStart < to - EPS && clip.timelineEnd > from + EPS)
    .map(({ clip }) => clip.clipId);
}

/**
 * Ids of the clips an operation created (pasted, inserted, split off…), so
 * the UI can select them.
 * @param {Edl} before
 * @param {Edl} after
 * @returns {string[]}
 */
export function newClipIds(before, after) {
  const known = indexClips(before);
  return allClips(after)
    .filter(({ clip }) => !known.has(clip.clipId))
    .map(({ clip }) => clip.clipId);
}
