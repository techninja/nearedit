/**
 * The small drags as pure functions: slip, fade handles and markers.
 * @module utils/timeline/reduce/tweaks
 */

import { moveMarker, setClipFades, slipClip, snapTime } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * Slip: dragging right pulls the material right, so the clip shows earlier
 * source — like sliding the film under a fixed window.
 * @param {Edl} base
 * @param {string} clipId
 * @param {number} delta - Seconds the pointer has travelled
 * @param {import('#utils/edl/types.js').SourceDurations} [sourceDurations]
 * @returns {Edl}
 */
export function slipPreview(base, clipId, delta, sourceDurations) {
  return slipClip(base, clipId, -delta, { sourceDurations });
}

/**
 * Fade handle: the handle follows the pointer along the clip's top edge.
 * @param {Edl} base
 * @param {string} clipId
 * @param {'in'|'out'} edge
 * @param {number} time - Timeline time under the pointer
 * @returns {Edl}
 */
export function fadePreview(base, clipId, edge, time) {
  for (const track of base.tracks) {
    const clip = track.clips.find((c) => c.clipId === clipId);
    if (!clip) continue;
    const fades =
      edge === 'in'
        ? { fadeIn: Math.max(0, time - clip.timelineStart) }
        : { fadeOut: Math.max(0, clip.timelineEnd - time) };
    return setClipFades(base, clipId, fades);
  }
  return base;
}

/**
 * Marker drag, snapping to clip edges and the playhead.
 * @param {Edl} base
 * @param {string} markerId
 * @param {number} time
 * @param {boolean} snapping
 * @param {import('./move.js').SnapContext} [snap]
 * @returns {{ doc: Edl, guide: number|null }}
 */
export function markerPreview(base, markerId, time, snapping, snap) {
  const hit = snapping && snap ? snapTime(base, time, snap) : null;
  const to = hit?.snapped ? hit.time : time;
  return { doc: moveMarker(base, markerId, to), guide: hit?.snapped ? hit.time : null };
}
