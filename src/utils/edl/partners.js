/**
 * Keeping linked A/V partners consistent when an overwrite cuts a clip:
 * the partner is cut over the same time range, and the pieces on each side
 * are linked to each other again. Internal to the library.
 * @module utils/edl/partners
 */

import { cutAround, intersects } from './clipMath.js';
import { pairPieces } from './links.js';
import { load, noteCut, rootId } from './session.js';

/** @typedef {import('./session.js').Session} Session */
/** @typedef {Map<string, import('./types.js').ClipRef>} ClipIndex */

/**
 * Apply every overwrite to the linked partner of the clip it hit, so a
 * linked pair is cut as one. Partners that are locked or are themselves
 * being moved are left alone.
 * @param {Session} s
 * @param {ClipIndex} index - Clips of the raw document
 * @returns {import('./session.js').Work[]} The tracks a partner was cut on
 */
export function spreadCuts(s, index) {
  /** @type {Set<import('./session.js').Work>} */
  const reached = new Set();
  for (const cut of [...s.cuts.values()]) {
    const track = index.get(cut.link)?.track;
    if (!track || track.locked || s.incoming.has(cut.link)) continue;
    const work = load(s, track);
    reached.add(work);
    for (const [from, to] of cut.spans) {
      const span = { timelineStart: from, timelineEnd: to };
      work.clips = work.clips.flatMap((clip) => {
        if (rootId(s, clip.clipId) !== cut.link || !intersects(clip, span)) return clip;
        const pieces = cutAround(clip, from, to);
        noteCut(s, clip, pieces, [from, to]);
        return pieces;
      });
    }
  }
  return [...reached];
}

/**
 * Re-pair the pieces of every linked pair that was cut (invariant 5). A
 * partner whose other half is gone becomes unlinked — the one change that
 * may reach a clip on a locked track.
 * @param {Session} s
 * @param {ClipIndex} index - Clips of the raw document
 */
export function relinkCuts(s, index) {
  /** @type {Map<string, string>} */
  const links = new Map();
  const pieces = (root) =>
    load(s, index.get(root).track).clips.filter((clip) => rootId(s, clip.clipId) === root);
  for (const [id, cut] of [...s.cuts]) {
    if (links.has(id) || !index.has(cut.link)) continue;
    for (const [a, b] of pairPieces(pieces(id), pieces(cut.link), id, cut.link)) links.set(a, b);
    if (!links.has(id)) links.set(id, '');
  }
  const apply = (clip) => {
    const next = links.get(clip.clipId) ?? clip.linkedClipId;
    return next === clip.linkedClipId ? clip : { ...clip, linkedClipId: next };
  };
  for (const work of s.work.values()) work.clips = work.clips.map(apply);
}
