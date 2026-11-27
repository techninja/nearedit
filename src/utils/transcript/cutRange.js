/**
 * Cutting a stretch out of one clip and closing the timeline over it — the
 * primitive behind text cuts and silence removal. Built from the ordinary
 * EDL operations: split at both ends, ripple-delete the middle. The linked
 * partner is split and removed with it, and every unlocked track (and the
 * markers) closes up, so the rest of the edit stays in sync.
 * Isomorphic and pure.
 * @module utils/transcript/cutRange
 */

import { findClip } from '#utils/edl/query.js';
import { rippleDelete } from '#utils/edl/ripple.js';
import { splitClips } from '#utils/edl/split.js';
import { EPS, frameDuration, snap } from '#utils/edl/time.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * Remove the timeline range `[from, to)` from a clip (and its linked
 * partner) and ripple everything after it left by the same amount.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} from - Timeline seconds; snapped to the frame grid
 * @param {number} to
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} Unchanged when the range misses the clip, is shorter than
 *   a frame, or the clip's track is locked
 */
export function cutClipRange(edl, clipId, from, to, opts = {}) {
  const found = findClip(edl, clipId);
  if (!found || found.track.locked) return edl;
  const { clip, track } = found;
  const start = Math.max(snap(edl, from), clip.timelineStart);
  const end = Math.min(snap(edl, to), clip.timelineEnd);
  if (end - start < frameDuration(edl) - EPS) return edl;

  const only = { clipIds: [clipId], cutFades: true };
  let doc = splitClips(edl, end, only);
  doc = splitClips(doc, start, only);
  // After the two splits the piece to drop starts at `start` on this track.
  const lane = doc.tracks.find((t) => t.trackId === track.trackId);
  const middle = lane.clips.find(
    (c) =>
      c.sourceFile === clip.sourceFile &&
      Math.abs(c.timelineStart - start) < EPS &&
      c.timelineEnd <= end + EPS,
  );
  if (!middle) return doc; // a cross-fade swallowed the range: the splits already removed it
  return rippleDelete(doc, [middle.clipId], {
    scope: 'all',
    autoCrossfade: opts.autoCrossfade,
  });
}

/**
 * Apply several cuts to a document. Cuts are made from the end of the
 * timeline backwards, so the times of the earlier ones stay true.
 * @param {Edl} edl
 * @param {{ clipId: string, from: number, to: number }[]} cuts - Timeline ranges
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function applyCuts(edl, cuts, opts = {}) {
  const ordered = [...cuts].sort((a, b) => b.from - a.from);
  return ordered.reduce((doc, cut) => cutClipRange(doc, cut.clipId, cut.from, cut.to, opts), edl);
}
