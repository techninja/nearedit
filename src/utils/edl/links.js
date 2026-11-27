/**
 * Link bookkeeping for invariant 5: `linkedClipId` is symmetric and always
 * points at a clip that exists. Isomorphic and pure.
 * @module utils/edl/links
 */

import { intersects } from './clipMath.js';
import { indexClips, mapClips } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/**
 * Write a set of link changes. Links are the one field that may change on a
 * locked track (its partner was deleted or split elsewhere).
 * @param {Edl} edl
 * @param {Map<string, string>} links - clipId → new linkedClipId
 * @returns {Edl}
 */
export function applyLinks(edl, links) {
  if (!links.size) return edl;
  const relink = (clip) => {
    const next = links.get(clip.clipId);
    return next === undefined || next === clip.linkedClipId
      ? clip
      : { ...clip, linkedClipId: next };
  };
  return mapClips(edl, relink, true);
}

/**
 * Make every link symmetric. Mutual pairs are kept; a one-way link is
 * completed when its target is free, otherwise dropped; links to missing
 * clips or to the clip itself are dropped.
 * @param {Edl} edl
 * @returns {Edl}
 */
export function repairLinks(edl) {
  const index = indexClips(edl);
  /** @type {Map<string, string>} */
  const pairs = new Map();
  const target = (clip) => {
    const other = index.get(clip.linkedClipId)?.clip;
    return other && other !== clip ? other : null;
  };
  for (const { clip } of index.values()) {
    if (target(clip)?.linkedClipId === clip.clipId) pairs.set(clip.clipId, clip.linkedClipId);
  }
  for (const { clip } of index.values()) {
    const other = target(clip);
    if (!other || pairs.has(clip.clipId) || pairs.has(other.clipId)) continue;
    pairs.set(clip.clipId, other.clipId);
    pairs.set(other.clipId, clip.clipId);
  }
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const { clip } of index.values()) {
    const wanted = pairs.get(clip.clipId) || '';
    if (wanted !== clip.linkedClipId) links.set(clip.clipId, wanted);
  }
  return applyLinks(edl, links);
}

/**
 * Re-pair the pieces of two linked clips after one or both were cut: pieces
 * that share timeline time are linked in order, the rest become unlinked.
 * @param {Clip[]} a - Pieces of the first clip, in time order
 * @param {Clip[]} b - Pieces of its partner, in time order
 * @param {string} idA - Original clipId of the first clip
 * @param {string} idB - Original clipId of the partner
 * @returns {Map<string, string>} clipId → linkedClipId for every piece
 */
export function pairPieces(a, b, idA, idB) {
  /** @type {Map<string, string>} */
  const links = new Map([...a, ...b].map((clip) => [clip.clipId, '']));
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (intersects(a[i], b[j])) {
      links.set(a[i].clipId, b[j].clipId);
      links.set(b[j].clipId, a[i].clipId);
      matched++;
      i++;
      j++;
    } else if (a[i].timelineEnd <= b[j].timelineEnd) i++;
    else j++;
  }
  if (!matched && links.has(idA) && links.has(idB)) {
    links.set(idA, idB);
    links.set(idB, idA);
  }
  return links;
}
