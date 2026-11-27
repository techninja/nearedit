/**
 * Moving clips in time and between tracks of the same type.
 * Linked and grouped partners travel together, nothing goes below 0, clips
 * on locked tracks never move and nothing is dropped onto a locked track.
 * Isomorphic and pure.
 * @module utils/edl/move
 */

import { shiftClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { indexClips, mapTracks, tracksOfType, withClips } from './immutable.js';
import { expandSelection } from './selection.js';
import { snapMove } from './snap.js';
import { EPS, clamp, fpsOf, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * @typedef {Object} MoveOptions
 * @property {number} [delta=0] - Seconds to move by (snapped to frames)
 * @property {string} [toTrackId] - Track the anchor clip should land on. Other
 *   moving clips of the anchor's type shift by the same number of tracks;
 *   clips of the other type stay on their track. Ignored when the track has
 *   a different type, or when any clip would land on a locked track
 * @property {string} [anchorId] - Clip under the pointer; the first id by default
 * @property {boolean} [linked=true] - Linked partners move too
 * @property {boolean} [grouped=true] - Grouped clips move too
 * @property {boolean} [autoCrossfade=true] - See crossfade.js
 * @property {import('./snap.js').SnapOptions} [snap] - Snap the anchor's edges
 */

/**
 * How many tracks the anchor's type should shift by, kept inside the lane.
 * @param {Track[]} lane - Tracks of the anchor's type, in display order
 * @param {ClipRef[]} moving
 * @param {ClipRef} anchor
 * @param {string} [toTrackId]
 * @returns {number}
 */
function laneOffset(lane, moving, anchor, toTrackId) {
  const target = lane.findIndex((track) => track.trackId === toTrackId);
  if (target < 0) return 0;
  const rows = moving.map((ref) => lane.indexOf(ref.track)).filter((row) => row >= 0);
  const wanted = target - lane.indexOf(anchor.track);
  const offset = clamp(wanted, -Math.min(...rows), lane.length - 1 - Math.max(...rows));
  return rows.some((row) => lane[row + offset].locked) ? 0 : offset;
}

/**
 * Move clips by a time delta and, optionally, to another track.
 * A drag calls this on every pointer move with the document the drag started
 * from; overlaps are resolved by `settle` (cross-fade or overwrite).
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {MoveOptions} [opts]
 * @returns {Edl}
 */
export function moveClips(edl, clipIds, opts = {}) {
  const { linked = true, grouped = true, autoCrossfade = true } = opts;
  const index = indexClips(edl);
  const ids = expandSelection(edl, clipIds, { linked, grouped });
  const moving = ids.map((id) => index.get(id));
  if (!moving.length) return edl;
  const anchor = moving.find((ref) => ref.clip.clipId === opts.anchorId) || moving[0];
  const anchorId = anchor.clip.clipId;

  let delta = opts.delta || 0;
  if (opts.snap) delta = snapMove(edl, ids, delta, { ...opts.snap, anchorId }).delta;
  const earliest = Math.min(...moving.map((ref) => ref.clip.timelineStart));
  delta = Math.max(snap(edl, delta), -earliest);

  const lane = tracksOfType(edl, anchor.track.type);
  const offset = laneOffset(lane, moving, anchor, opts.toTrackId);
  if (Math.abs(delta) < EPS && !offset) return edl;

  /** @type {Map<Track, ClipRef[]>} */
  const arrivals = new Map();
  for (const ref of moving) {
    const row = lane.indexOf(ref.track);
    const target = row < 0 ? ref.track : lane[row + offset];
    arrivals.set(target, [...(arrivals.get(target) || []), ref]);
  }
  const leaving = new Set(ids);
  const fps = fpsOf(edl);
  const raw = mapTracks(edl, (track) => {
    const arriving = arrivals.get(track) || [];
    if (!arriving.length && !track.clips.some((clip) => leaving.has(clip.clipId))) return track;
    const staying = track.clips.filter((clip) => !leaving.has(clip.clipId));
    return withClips(track, [...staying, ...arriving.map((ref) => shiftClip(ref.clip, delta, fps))]);
  });
  return settle(edl, raw, { incoming: ids, autoCrossfade, linked });
}
