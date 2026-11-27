/**
 * Splitting clips at a time. The left half keeps the clip's id and its
 * fade-in; the right half gets a new id and the fade-out. Linked pairs are
 * linked again on each side of the cut. Isomorphic and pure.
 * @module utils/edl/split
 */

import { sliceClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { newId } from './factory.js';
import { indexClips, isTimed, mapClips } from './immutable.js';
import { applyLinks } from './links.js';
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
    ? new Set(linked ? expandSelection(edl, opts.clipIds, { grouped: false }) : opts.clipIds)
    : null;
  const lanes = opts.trackIds ? new Set(opts.trackIds) : null;
  /** @type {Map<string, string>} */
  const rights = new Map();
  const cut = mapClips(edl, (clip, track) => {
    if ((only && !only.has(clip.clipId)) || (lanes && !lanes.has(track.trackId))) return clip;
    if (at - clip.timelineStart < EPS || clip.timelineEnd - at < EPS) return clip;
    const timed = isTimed(clip, track);
    const right = sliceClip(clip, at, clip.timelineEnd, timed, newId('clip'));
    rights.set(clip.clipId, right.clipId);
    return [sliceClip(clip, clip.timelineStart, at, timed), right];
  });
  if (!rights.size) return edl;
  // settle re-derives the fades of halves that were cut inside a cross-fade.
  return settle(edl, relinkHalves(cut, rights, at), {});
}
