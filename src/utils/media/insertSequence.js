/**
 * Adding several media items to the timeline one after another — the
 * media bin's "add" for a multi-selection. Isomorphic and pure.
 * @module utils/media/insertSequence
 */

import { insertMedia } from '#utils/edl/insert.js';
import { findClip } from '#utils/edl/query.js';
import { newClipIds } from '#utils/edl/selection.js';
import { EPS, snap } from '#utils/edl/time.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} SequenceEntry
 * @property {any} item - A MediaItem (docs/app-spec/API.md § Media)
 * @property {number} [sourceIn] - Use only part of the source
 * @property {number} [sourceOut]
 */

/**
 * Whether a clip that appeared during an insert is the inserted media
 * itself, not the right half of a clip the insert cut in two.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ filePath: string }} item
 * @param {number|undefined} time - Where the insert was aimed, when given
 * @returns {boolean}
 */
function isInserted(edl, clipId, item, time) {
  const { clip } = findClip(edl, clipId);
  if (clip.sourceFile !== item.filePath) return false;
  return (
    !Number.isFinite(time) || Math.abs(clip.timelineStart - snap(edl, Math.max(0, time))) < EPS
  );
}

/**
 * Insert items back to back, the first at `time`. Items that cannot go on a
 * timeline (text files) are skipped.
 * @param {Edl} edl
 * @param {SequenceEntry[]} entries - In the order they should play
 * @param {{ time?: number, trackId?: string, ripple?: boolean, autoCrossfade?: boolean }} [opts] -
 *   Without `time` the items are appended to the end of their tracks
 * @returns {{ edl: Edl, clipIds: string[], end: number, placed: number }} The
 *   new document, the ids of every clip created, where the last one ends
 *   and how many items were placed
 */
export function insertSequence(edl, entries, opts = {}) {
  let doc = edl;
  let time = opts.time;
  let end = Number.isFinite(time) ? time : 0;
  let placed = 0;
  /** @type {string[]} */
  const clipIds = [];
  for (const { item, sourceIn, sourceOut } of entries) {
    const next = insertMedia(doc, item, {
      time,
      trackId: opts.trackId,
      ripple: opts.ripple,
      autoCrossfade: opts.autoCrossfade,
      sourceIn,
      sourceOut,
    });
    const created = newClipIds(doc, next).filter((id) => isInserted(next, id, item, time));
    if (!created.length) continue;
    placed++;
    clipIds.push(...created);
    end = Math.max(...created.map((id) => findClip(next, id).clip.timelineEnd));
    if (Number.isFinite(time)) time = end;
    doc = next;
  }
  return { edl: doc, clipIds, end, placed };
}
