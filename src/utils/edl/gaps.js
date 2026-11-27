/**
 * Closing the gaps on a track. Isomorphic and pure.
 * @module utils/edl/gaps
 */

import { settle } from './crossfade.js';
import { indexClips } from './immutable.js';
import { shiftClips } from './shift.js';
import { EPS, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Close the gaps on one track: every clip slides left until it touches the
 * clip before it (cross-fades are kept as they are). Linked partners on
 * other tracks slide by the same amount to stay in sync — under the normal
 * overlap rules, so they can cross-fade with or overwrite what they meet.
 * A pair never slides further than its partner can go (time 0).
 * @param {Edl} edl
 * @param {string} trackId
 * @param {{ from?: number, linked?: boolean, autoCrossfade?: boolean }} [opts]
 *   `from`: only gaps after this time are closed (default 0, which also
 *   pulls the first clip to the start of the timeline)
 * @returns {Edl}
 */
export function closeGaps(edl, trackId, opts = {}) {
  const track = edl.tracks.find((t) => t.trackId === trackId);
  if (!track || track.locked) return edl;
  const index = indexClips(edl);
  /** @type {Map<string, number>} */
  const shifts = new Map();
  const from = Math.max(0, snap(edl, opts.from ?? 0));
  let edge = from;
  let previous = 0;
  for (const clip of track.clips) {
    let shift = 0;
    if (clip.timelineStart >= from - EPS) {
      // Close the gap to the clip before, or travel with it when they overlap.
      shift = Math.max(previous, clip.timelineStart - edge, 0);
      const partner = opts.linked !== false && index.get(clip.linkedClipId);
      const follows = partner && partner.track !== track && !partner.track.locked;
      if (follows) shift = Math.min(shift, partner.clip.timelineStart);
      if (shift > EPS) shifts.set(clip.clipId, -shift);
      if (shift > EPS && follows) shifts.set(partner.clip.clipId, -shift);
    }
    edge = Math.max(edge, clip.timelineEnd - shift);
    previous = shift;
  }
  if (!shifts.size) return edl;
  const shifted = shiftClips(edl, (clip) => shifts.get(clip.clipId) || 0);
  return settle(edl, shifted.edl, { incoming: shifted.moved, autoCrossfade: opts.autoCrossfade });
}
