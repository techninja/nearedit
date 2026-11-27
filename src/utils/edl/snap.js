/**
 * Snapping. Candidates are the edges of other clips, the playhead, markers,
 * time 0 and an optional extra list (beats). Every function reports what it
 * snapped to so the UI can draw a guide. Thresholds are in seconds — the
 * caller converts from pixels with the current zoom. Isomorphic and pure.
 * @module utils/edl/snap
 */

import { idList, indexClips } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} SnapTarget
 * @property {number} time
 * @property {'playhead'|'marker'|'clip'|'origin'|'extra'} type
 * @property {string} [id] - clipId or markerId
 * @property {'start'|'end'} [edge] - Which edge of that clip
 */

/**
 * @typedef {Object} SnapOptions
 * @property {number} [threshold=0.1] - Seconds
 * @property {number} [playhead] - Playhead time; omitted = not a candidate
 * @property {number[]} [extra] - Extra times, e.g. beats of a music clip
 * @property {Iterable<string>} [exclude] - clipIds whose edges do not count
 *   (the clips being dragged)
 * @property {boolean} [clips=true] - Snap to clip edges
 * @property {boolean} [markers=true] - Snap to markers
 * @property {SnapTarget[]} [candidates] - Precomputed with `snapCandidates`
 *   at drag start; skips rebuilding the list on every pointer move
 */

/**
 * Everything a time may snap to, in priority order (first wins a tie).
 * @param {Edl} edl
 * @param {SnapOptions} [opts]
 * @returns {SnapTarget[]}
 */
export function snapCandidates(edl, opts = {}) {
  if (opts.candidates) return opts.candidates;
  const skip = new Set(idList(opts.exclude));
  /** @type {SnapTarget[]} */
  const out = [];
  if (Number.isFinite(opts.playhead)) out.push({ time: opts.playhead, type: 'playhead' });
  if (opts.markers !== false) {
    for (const m of edl.markers || []) out.push({ time: m.time, type: 'marker', id: m.markerId });
  }
  if (opts.clips !== false) {
    for (const { clip } of indexClips(edl).values()) {
      if (skip.has(clip.clipId)) continue;
      out.push({ time: clip.timelineStart, type: 'clip', id: clip.clipId, edge: 'start' });
      out.push({ time: clip.timelineEnd, type: 'clip', id: clip.clipId, edge: 'end' });
    }
  }
  out.push({ time: 0, type: 'origin' });
  for (const time of opts.extra || []) if (Number.isFinite(time)) out.push({ time, type: 'extra' });
  return out;
}

/**
 * Snap several times that move together (one time, or a clip's two edges)
 * to the nearest candidate within the threshold.
 * @param {Edl} edl
 * @param {number[]} times
 * @param {SnapOptions} [opts]
 * @returns {{ delta: number, snapped: boolean, target: SnapTarget|null, index: number }}
 *   `delta` to add to every time; `index` of the time that snapped (-1 = none)
 */
export function snapTimes(edl, times, opts = {}) {
  const threshold = opts.threshold ?? 0.1;
  let best = { delta: 0, snapped: false, target: null, index: -1 };
  let distance = threshold;
  for (const target of snapCandidates(edl, opts)) {
    for (let index = 0; index < times.length; index++) {
      const delta = target.time - times[index];
      const gap = Math.abs(delta);
      if (!(gap <= distance) || (best.snapped && gap === distance)) continue;
      distance = gap;
      best = { delta, snapped: true, target, index };
    }
  }
  return best;
}

/**
 * Snap one time (playhead scrub, trim edge, marker drag, paste position).
 * @param {Edl} edl
 * @param {number} time
 * @param {SnapOptions} [opts]
 * @returns {{ time: number, snapped: boolean, target: SnapTarget|null }}
 */
export function snapTime(edl, time, opts = {}) {
  const { delta, snapped, target } = snapTimes(edl, [time], opts);
  return { time: time + delta, snapped, target };
}

/**
 * Snap a clip-sized span by whichever of its two edges is nearest a candidate.
 * @param {Edl} edl
 * @param {number} start
 * @param {number} end
 * @param {SnapOptions} [opts]
 * @returns {{ start: number, end: number, delta: number, snapped: boolean,
 *   target: SnapTarget|null, edge: 'start'|'end'|null }}
 */
export function snapEdges(edl, start, end, opts = {}) {
  const { delta, snapped, target, index } = snapTimes(edl, [start, end], opts);
  const edge = index < 0 ? null : index === 0 ? 'start' : 'end';
  return { start: start + delta, end: end + delta, delta, snapped, target, edge };
}

/**
 * Snap a drag of clips: the anchor clip's edges, shifted by the drag delta,
 * snap to everything that is not moving.
 * @param {Edl} edl
 * @param {Iterable<string>|string} clipIds - All moving clips (see `expandSelection`)
 * @param {number} delta - Unsnapped drag distance in seconds
 * @param {SnapOptions & { anchorId?: string }} [opts] - `anchorId` is the
 *   clip under the pointer, the first id by default
 * @returns {{ delta: number, snapped: boolean, target: SnapTarget|null,
 *   edge: 'start'|'end'|null }} The delta to pass to `moveClips`
 */
export function snapMove(edl, clipIds, delta, opts = {}) {
  const index = indexClips(edl);
  const moving = idList(clipIds);
  const anchor = (index.get(opts.anchorId) || index.get(moving[0]))?.clip;
  if (!anchor) return { delta, snapped: false, target: null, edge: null };
  const exclude = [...moving, ...idList(opts.exclude)];
  const span = [anchor.timelineStart + delta, anchor.timelineEnd + delta];
  const hit = snapEdges(edl, span[0], span[1], { ...opts, exclude });
  return { delta: delta + hit.delta, snapped: hit.snapped, target: hit.target, edge: hit.edge };
}
