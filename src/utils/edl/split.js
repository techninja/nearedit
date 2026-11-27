/**
 * Splitting clips at a time. The left half keeps the clip's id and its
 * fade-in; the right half gets a new id, the fade-out and the later part
 * of the source window. Both halves keep the whole effect stack and every
 * keyframe (effect ids only have to be unique within a clip), so nothing
 * on screen changes. Linked pairs are linked again on each side of the cut.
 * Isomorphic and pure.
 * @module utils/edl/split
 */

import { sliceClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { NO_OVERLAP, neighbourOverlaps } from './fades.js';
import { newId } from './factory.js';
import { idList, indexClips, mapTracks, withClips } from './immutable.js';
import { applyLinks, repairLinks } from './links.js';
import { expandSelection } from './selection.js';
import { EPS, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} SplitOptions
 * @property {Iterable<string>} [clipIds] - Split only these clips; by
 *   default every clip under the time on an unlocked track is split
 * @property {Iterable<string>} [trackIds] - Split only on these tracks
 * @property {boolean} [linked=true] - With `clipIds`: split their linked
 *   partners too
 * @property {boolean} [cutFades=false] - What to do when the time falls
 *   inside a cross-fade, where the two clips are fused and a half would end
 *   up inside the other clip. By default those two clips are left alone.
 *   With `cutFades` the cross-fade becomes a hard cut at that time: the
 *   outgoing clip ends there and the incoming clip starts there (used by
 *   ripple edits, which must open every track at one time). A clip that
 *   does nothing but fade — in over one neighbour and out under the next,
 *   which meet exactly at the cut — is removed by such a cut.
 */

/**
 * Link the right halves. When both partners were split, right links to
 * right. When only one was, the uncut partner stays with the half on its
 * side of the cut and the other half becomes unlinked.
 * @param {Edl} edl - Document after the cut
 * @param {Map<string, string>} rights - Left (original) id → right id
 * @param {number} time
 * @returns {Edl}
 */
function relinkHalves(edl, rights, time) {
  const index = indexClips(edl);
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const [leftId, rightId] of rights) {
    const partnerId = index.get(leftId).clip.linkedClipId;
    const partner = index.get(partnerId)?.clip;
    if (!partner) continue;
    if (rights.has(partnerId)) links.set(rightId, rights.get(partnerId));
    else if (partner.timelineStart >= time - EPS) {
      links.set(rightId, partnerId).set(partnerId, rightId).set(leftId, '');
    }
  }
  return applyLinks(edl, links);
}

/**
 * Split clips at a time. Clips whose edge is exactly at the time, and clips
 * on locked tracks, are left alone.
 * @param {Edl} edl
 * @param {number} time
 * @param {SplitOptions} [opts]
 * @returns {Edl}
 */
export function splitClips(edl, time, opts = {}) {
  const at = snap(edl, time);
  const linked = opts.linked !== false;
  const only = opts.clipIds
    ? new Set(
        linked ? expandSelection(edl, opts.clipIds, { grouped: false }) : idList(opts.clipIds),
      )
    : null;
  const lanes = opts.trackIds ? new Set(idList(opts.trackIds)) : null;
  /** @type {Map<string, string>} */
  const rights = new Map();
  let dropped = false;
  const cut = mapTracks(edl, (track) => {
    if (track.locked || (lanes && !lanes.has(track.trackId))) return track;
    const under = (clip) => at - clip.timelineStart > EPS && clip.timelineEnd - at > EPS;
    const wanted = (clip) => under(clip) && (!only || only.has(clip.clipId));
    if (!track.clips.some(wanted)) return track;
    const overlaps = neighbourOverlaps(track.clips);
    const clips = track.clips.flatMap((clip) => {
      if (!wanted(clip)) return clip;
      const overlap = overlaps.get(clip.clipId) || NO_OVERLAP;
      const fadingIn = overlap.in > EPS && at - clip.timelineStart <= overlap.in + EPS;
      const fadingOut = overlap.out > EPS && clip.timelineEnd - at <= overlap.out + EPS;
      if (fadingIn || fadingOut) {
        if (!opts.cutFades) return clip;
        // Fading in over one neighbour and out under the next, cut where the
        // two meet: neither side of a hard cut has any of this clip left.
        if (fadingIn && fadingOut) {
          dropped = true;
          return [];
        }
        return fadingOut
          ? sliceClip(clip, clip.timelineStart, at)
          : sliceClip(clip, at, clip.timelineEnd);
      }
      const right = sliceClip(clip, at, clip.timelineEnd, undefined, newId('clip'));
      rights.set(clip.clipId, right.clipId);
      return [sliceClip(clip, clip.timelineStart, at), right];
    });
    return withClips(track, clips);
  });
  if (cut === edl) return edl;
  const relinked = relinkHalves(cut, rights, at);
  // settle resets the fades of a cross-fade that was cut apart.
  return settle(edl, dropped ? repairLinks(relinked) : relinked, {});
}
