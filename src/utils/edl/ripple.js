/**
 * Ripple edits: removing or opening time so that later clips follow.
 * Locked tracks never ripple. Isomorphic and pure.
 * @module utils/edl/ripple
 */

import { settle } from './crossfade.js';
import { idList, indexClips, mapClips } from './immutable.js';
import { repairLinks } from './links.js';
import { retimeMarkers } from './markers.js';
import { expandSelection } from './selection.js';
import { closedBefore, shiftClips, subtractSpans } from './shift.js';
import { splitClips } from './split.js';
import { EPS, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Track} Track */

/**
 * @typedef {Object} RippleOptions
 * @property {Iterable<string>} [trackIds] - Tracks to ripple; every unlocked
 *   track by default
 * @property {boolean} [markers] - Markers follow the ripple. Default: true
 *   when every track ripples, false when `trackIds` limits it
 * @property {boolean} [autoCrossfade=true] - See crossfade.js
 */

/**
 * @param {Edl} edl
 * @param {RippleOptions} opts
 * @returns {{ ids: string[], inScope: (track: Track) => boolean, markers: boolean }}
 */
function scopeOf(edl, opts) {
  const only = opts.trackIds ? new Set(idList(opts.trackIds)) : null;
  const inScope = (track) => !track.locked && (!only || only.has(track.trackId));
  const ids = edl.tracks.filter(inScope).map((track) => track.trackId);
  return { ids, inScope, markers: opts.markers ?? !only };
}

/**
 * Delete clips and close the hole they leave.
 *
 * The hole is the time the deleted clips covered that no remaining clip on
 * their tracks still covers. Clips that start at or after a hole move left
 * by its length: on the tracks that lost a clip (`scope: 'track'`) or on
 * every unlocked track, together with the markers (`scope: 'all'`).
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {{ scope?: 'track'|'all', linked?: boolean, autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function rippleDelete(edl, clipIds, opts = {}) {
  const { scope = 'track', linked = true, autoCrossfade = true } = opts;
  const index = indexClips(edl);
  const removed = expandSelection(edl, clipIds, { linked, grouped: false });
  if (!removed.length) return edl;
  const gone = new Set(removed);
  const lanes = new Set(removed.map((id) => index.get(id).track.trackId));
  const cleared = repairLinks(mapClips(edl, (clip) => (gone.has(clip.clipId) ? null : clip)));

  /** @type {(clip: import('./types.js').Clip) => [number, number]} */
  const spanOf = (clip) => [clip.timelineStart, clip.timelineEnd];
  const spans = removed.map((id) => spanOf(index.get(id).clip));
  const covered = cleared.tracks
    .filter((track) => lanes.has(track.trackId))
    .flatMap((track) => track.clips.map(spanOf));
  const holes = subtractSpans(spans, covered);
  const ripples = (track) => scope === 'all' || lanes.has(track.trackId);
  const shifted = shiftClips(cleared, (clip, track) =>
    ripples(track) ? -closedBefore(holes, clip.timelineStart) : 0,
  );
  const collapse = (time) =>
    time - holes.reduce((sum, [a, b]) => sum + Math.min(Math.max(time - a, 0), b - a), 0);
  const raw = scope === 'all' ? retimeMarkers(shifted.edl, collapse) : shifted.edl;
  return settle(edl, raw, { incoming: shifted.moved, autoCrossfade, linked });
}

/**
 * Remove a stretch of time: clips inside it are deleted, clips that cross
 * its edges are cut, and everything after moves left to close it. A
 * cross-fade under one of the edges becomes a hard cut there.
 * @param {Edl} edl
 * @param {number} start
 * @param {number} end
 * @param {RippleOptions} [opts]
 * @returns {Edl}
 */
export function rippleDeleteRange(edl, start, end, opts = {}) {
  const from = Math.max(0, snap(edl, Math.min(start, end)));
  const to = snap(edl, Math.max(start, end));
  const length = to - from;
  if (!(length > EPS)) return edl;
  const scope = scopeOf(edl, opts);
  const through = { trackIds: scope.ids, linked: false, cutFades: true };
  const cut = splitClips(splitClips(edl, from, through), to, through);
  const inside = (clip) => clip.timelineStart >= from - EPS && clip.timelineEnd <= to + EPS;
  const cleared = repairLinks(
    mapClips(cut, (clip, track) => (scope.inScope(track) && inside(clip) ? null : clip)),
  );
  const shifted = shiftClips(cleared, (clip, track) =>
    scope.inScope(track) && clip.timelineStart >= to - EPS ? -length : 0,
  );
  const pull = (time) => (time >= to ? time - length : time > from ? null : time);
  const raw = scope.markers ? retimeMarkers(shifted.edl, pull) : shifted.edl;
  return settle(cut, raw, { incoming: shifted.moved, autoCrossfade: opts.autoCrossfade });
}

/**
 * Open a gap: clips that cross `time` are split there and everything from
 * `time` on moves right by `duration`. A cross-fade under `time` becomes a
 * hard cut: the outgoing clip stays left of the gap, the incoming one right.
 * @param {Edl} edl
 * @param {number} time
 * @param {number} duration
 * @param {RippleOptions} [opts]
 * @returns {Edl}
 */
export function rippleInsert(edl, time, duration, opts = {}) {
  const at = Math.max(0, snap(edl, time));
  const length = snap(edl, duration);
  if (!(length > EPS) || !Number.isFinite(at + length)) return edl;
  const scope = scopeOf(edl, opts);
  const cut = splitClips(edl, at, { trackIds: scope.ids, linked: false, cutFades: true });
  const shifted = shiftClips(cut, (clip, track) =>
    scope.inScope(track) && clip.timelineStart >= at - EPS ? length : 0,
  );
  const push = (t) => (t >= at - EPS ? t + length : t);
  const raw = scope.markers ? retimeMarkers(shifted.edl, push) : shifted.edl;
  return settle(cut, raw, { incoming: shifted.moved, autoCrossfade: opts.autoCrossfade });
}
