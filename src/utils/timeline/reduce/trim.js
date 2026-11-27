/**
 * Trim gesture as a pure function: drag a clip edge to a time, with
 * snapping, source limits, auto-crossfade and ripple.
 * @module utils/timeline/reduce/trim
 */

import { findClip, snapTime, trimClipEnd, trimClipStart } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} TrimDrag
 * @property {string} clipId
 * @property {'start'|'end'} edge
 * @property {number} time - Where the pointer wants the edge, seconds
 */

/** Two times closer than this are the same place on the frame grid. */
const SAME_TIME = 1e-4;

/**
 * The document a trim drag shows at this moment.
 * @param {Edl} base - Document the drag started from
 * @param {TrimDrag} drag
 * @param {import('./move.js').EditModes} modes
 * @param {import('./move.js').SnapContext} [snap]
 * @param {import('#utils/edl/types.js').SourceDurations} [sourceDurations]
 * @returns {{ doc: Edl, guide: number|null }} `guide`: the snap target the
 *   edge landed on, or null (also when a limit stopped it short)
 */
export function trimPreview(base, drag, modes, snap, sourceDurations) {
  const { clipId, edge } = drag;
  let time = drag.time;
  let guide = null;
  if (modes.snapping && snap) {
    const hit = snapTime(base, time, snap);
    if (hit.snapped) {
      time = hit.time;
      guide = hit.time;
    }
  }
  const trim = edge === 'start' ? trimClipStart : trimClipEnd;
  const doc = trim(base, clipId, time, {
    sourceDurations,
    ripple: modes.ripple,
    autoCrossfade: modes.autoCrossfade,
  });
  if (guide !== null) {
    const clip = findClip(doc, clipId)?.clip;
    const at = clip ? (edge === 'start' ? clip.timelineStart : clip.timelineEnd) : NaN;
    if (!(Math.abs(at - guide) < SAME_TIME)) guide = null;
  }
  return { doc, guide };
}
