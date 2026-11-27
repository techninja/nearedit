/**
 * Move gesture, as a pure function of the document the drag started from
 * and where the pointer is now. Honours snapping, auto-crossfade and ripple
 * mode, and reports the time the clips snapped to so a guide can be drawn.
 * @module utils/timeline/reduce/move
 */

import { EPS, expandSelection, findClip, moveClips, snapMove } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} EditModes
 * @property {boolean} snapping
 * @property {boolean} ripple
 * @property {boolean} autoCrossfade
 */

/**
 * @typedef {Object} SnapContext
 * @property {number} threshold - Seconds
 * @property {import('#utils/edl/snap.js').SnapTarget[]} candidates - Built
 *   once at drag start, without the clips being dragged
 */

/**
 * @typedef {Object} MoveDrag
 * @property {string[]} clipIds - The dragged selection
 * @property {string} anchorId - Clip under the pointer
 * @property {number} delta - Seconds the pointer has travelled
 * @property {string} [toTrackId] - Track under the pointer
 */

/** Two times closer than this are the same place on the frame grid. */
const SAME_TIME = 1e-4;

/**
 * The clips a ripple move carries along: on every track that holds a moving
 * clip, everything from the first moving clip onwards.
 * @param {Edl} doc
 * @param {Iterable<string>} clipIds
 * @returns {string[]} The expanded selection first, then the followers
 */
export function withDownstream(doc, clipIds) {
  const moving = new Set(expandSelection(doc, clipIds));
  const out = [...moving];
  for (const track of doc.tracks) {
    if (track.locked) continue;
    const first = track.clips.find((clip) => moving.has(clip.clipId));
    if (!first) continue;
    for (const clip of track.clips) {
      const follows = clip.timelineStart >= first.timelineStart - EPS;
      if (follows && !moving.has(clip.clipId)) out.push(clip.clipId);
    }
  }
  return out;
}

/**
 * Every clip that travels in a move, for building snap candidates.
 * @param {Edl} doc
 * @param {string[]} clipIds
 * @param {boolean} ripple
 * @returns {string[]}
 */
export function movingClips(doc, clipIds, ripple) {
  return expandSelection(doc, ripple ? withDownstream(doc, clipIds) : clipIds);
}

/**
 * The document a move drag shows at this moment.
 * @param {Edl} base - Document the drag started from
 * @param {MoveDrag} drag
 * @param {EditModes} modes
 * @param {SnapContext} [snap]
 * @returns {{ doc: Edl, guide: number|null }} `guide`: time of the snap
 *   target the anchor clip landed on, or null
 */
export function movePreview(base, drag, modes, snap) {
  const { clipIds, anchorId, toTrackId } = drag;
  const ids = modes.ripple ? withDownstream(base, clipIds) : clipIds;
  let delta = drag.delta;
  let guide = null;
  if (modes.snapping && snap) {
    const hit = snapMove(base, expandSelection(base, ids), delta, { ...snap, anchorId });
    if (hit.snapped) {
      delta = hit.delta;
      guide = hit.target.time;
    }
  }
  const opts = { anchorId, autoCrossfade: modes.autoCrossfade };
  const lane = modes.ripple ? undefined : toTrackId;
  let doc = moveClips(base, ids, { ...opts, delta, toTrackId: lane });
  // Ripple carries the followers in time only; the dragged clips alone change track.
  if (modes.ripple && toTrackId) doc = moveClips(doc, clipIds, { ...opts, toTrackId });
  if (guide !== null) {
    const anchor = findClip(doc, anchorId)?.clip;
    const near = (time) => Math.abs(time - guide) < SAME_TIME;
    if (!anchor || !(near(anchor.timelineStart) || near(anchor.timelineEnd))) guide = null;
  }
  return { doc, guide };
}
