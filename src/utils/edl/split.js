/**
 * Splitting clips at a time. The left half keeps the clip's id and its
 * fade-in; the right half gets a new id and the fade-out. Linked pairs are
 * linked again on each side of the cut. Isomorphic and pure.
 * @module utils/edl/split
 */

import { sliceClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { neighbourOverlaps } from './fades.js';
import { newId } from './factory.js';
import { indexClips, isTimed, mapClips } from './immutable.js';
import { applyLinks } from './links.js';
import { EPS, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} SplitOptions
 * @property {Iterable<string>} [clipIds] - Split only these clips; by
 *   default every clip under the time on an unlocked track is split
 * @property {Iterable<string>} [trackIds] - Split only on these tracks
 * @property {boolean} [linked=true] - With `clipIds`: split their linked
 *   partners too
 *
 * A cut that passes through a cross-fade always splits both of its clips.
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
 * The clips an explicit split must cut: the requested ones, their linked
 * partners, and — because two clips are fused while they cross-fade — the
 * other clip of any cross-fade the cut passes through.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {number} at
 * @param {boolean} linked
 * @returns {Set<string>}
 */
function splitTargets(edl, clipIds, at, linked) {
  const index = indexClips(edl);
  /** @type {Map<string, Map<string, import('./fades.js').EdgeOverlap>>} */
  const overlaps = new Map();
  /** @type {Set<string>} */
  const out = new Set();
  const queue = [...clipIds];
  while (queue.length) {
    const ref = index.get(queue.shift());
    if (!ref || ref.track.locked || out.has(ref.clip.clipId)) continue;
    const { clip, track } = ref;
    out.add(clip.clipId);
    if (linked && clip.linkedClipId) queue.push(clip.linkedClipId);
    if (!overlaps.has(track.trackId)) overlaps.set(track.trackId, neighbourOverlaps(track.clips));
    const overlap = overlaps.get(track.trackId).get(clip.clipId);
    if (!overlap) continue;
    const intoFadeIn = at - clip.timelineStart > EPS && at - clip.timelineStart < overlap.in - EPS;
    const intoFadeOut = clip.timelineEnd - at > EPS && clip.timelineEnd - at < overlap.out - EPS;
    if (intoFadeIn) queue.push(overlap.prev);
    if (intoFadeOut) queue.push(overlap.next);
  }
  return out;
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
  const only = opts.clipIds ? splitTargets(edl, opts.clipIds, at, opts.linked !== false) : null;
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
