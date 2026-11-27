/**
 * Trimming a clip edge, with optional ripple. The linked partner trims by
 * the same amount; images, titles and placeholders have a free duration.
 * Isomorphic and pure.
 * @module utils/edl/trim
 */

import { settle } from './crossfade.js';
import { NO_OVERLAP, neighbourOverlaps } from './fades.js';
import { indexClips, isTimed, mapClips } from './immutable.js';
import { retimeMarkers } from './markers.js';
import { expandSelection } from './selection.js';
import { shiftClips } from './shift.js';
import { snapTime } from './snap.js';
import { EPS, snap } from './time.js';
import { limitTrim } from './trimLimits.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * @typedef {Object} TrimOptions
 * @property {import('./types.js').SourceDurations} [sourceDurations] - Known
 *   source lengths; without one a video/audio clip may be extended freely
 * @property {boolean} [ripple=false] - Later clips follow the edit. Trimming
 *   the start with ripple keeps the clip where it is and pulls the rest in
 * @property {'track'|'all'} [rippleScope='track'] - Ripple the trimmed
 *   clips' tracks, or every unlocked track (and the markers)
 * @property {boolean} [autoCrossfade=true] - See crossfade.js
 * @property {boolean} [linked=true] - Trim the linked partner too
 * @property {import('./snap.js').SnapOptions} [snap] - Snap the edge
 */

/**
 * One clip with an edge moved by `delta`.
 * @param {Edl} edl
 * @param {ClipRef} ref
 * @param {'start'|'end'} edge
 * @param {number} delta
 * @param {boolean} ripple
 * @returns {Clip}
 */
function retime(edl, { clip, track }, edge, delta, ripple) {
  let { timelineStart, timelineEnd, sourceIn } = clip;
  if (edge === 'end') timelineEnd = snap(edl, timelineEnd + delta);
  else if (ripple) timelineEnd = snap(edl, timelineEnd - delta);
  else timelineStart = snap(edl, timelineStart + delta);
  if (edge === 'start' && isTimed(clip, track)) sourceIn = Math.max(0, sourceIn + delta);
  const sourceOut = sourceIn + (timelineEnd - timelineStart);
  return { ...clip, timelineStart, timelineEnd, sourceIn, sourceOut };
}

/**
 * @param {Edl} edl
 * @param {string} clipId
 * @param {'start'|'end'} edge
 * @param {number} time
 * @param {TrimOptions} opts
 * @returns {Edl}
 */
function trimEdge(edl, clipId, edge, time, opts) {
  const index = indexClips(edl);
  const found = index.get(clipId);
  if (!found || found.track.locked) return edl;
  const linked = opts.linked !== false;
  const ids = expandSelection(edl, [clipId], { linked, grouped: false });
  const targets = ids.map((id) => index.get(id));
  const to = opts.snap ? snapTime(edl, time, { ...opts.snap, exclude: ids }).time : time;
  const from = edge === 'start' ? found.clip.timelineStart : found.clip.timelineEnd;
  const delta = limitTrim(edl, targets, edge, snap(edl, to) - from, opts);
  if (Math.abs(delta) < EPS) return edl;

  const ripple = !!opts.ripple;
  const trimmed = new Map(
    targets.map((ref) => [ref.clip.clipId, retime(edl, ref, edge, delta, ripple)]),
  );
  let raw = mapClips(edl, (clip) => trimmed.get(clip.clipId) || clip);
  let incoming = ids;
  if (ripple) {
    // Everything from the first clip after the trimmed ones follows the edit.
    const tails = targets.map(({ clip, track }) => {
      const overlap = neighbourOverlaps(track.clips).get(clip.clipId) || NO_OVERLAP;
      return clip.timelineEnd - overlap.out;
    });
    const point = Math.min(...tails);
    const all = opts.rippleScope === 'all';
    const lanes = new Set(targets.map((ref) => ref.track.trackId));
    const by = edge === 'end' ? delta : -delta;
    const follows = (clip, track) =>
      !trimmed.has(clip.clipId) &&
      (all || lanes.has(track.trackId)) &&
      clip.timelineStart >= point - EPS;
    const shifted = shiftClips(raw, (clip, track) => (follows(clip, track) ? by : 0));
    raw = all ? retimeMarkers(shifted.edl, (t) => (t >= point - EPS ? t + by : t)) : shifted.edl;
    incoming = [...ids, ...shifted.moved];
  }
  return settle(edl, raw, { incoming, autoCrossfade: opts.autoCrossfade, linked });
}

/**
 * Drag a clip's left edge to a timeline time.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} time - Where the edge should go
 * @param {TrimOptions} [opts]
 * @returns {Edl}
 */
export function trimClipStart(edl, clipId, time, opts = {}) {
  return trimEdge(edl, clipId, 'start', time, opts);
}

/**
 * Drag a clip's right edge to a timeline time.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} time - Where the edge should go
 * @param {TrimOptions} [opts]
 * @returns {Edl}
 */
export function trimClipEnd(edl, clipId, time, opts = {}) {
  return trimEdge(edl, clipId, 'end', time, opts);
}
