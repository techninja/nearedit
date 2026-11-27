/**
 * Overlap resolution — the Vegas signature (invariant 4).
 *
 * Every operation that moves, trims or adds clips builds a "raw" document
 * and hands it to `settle` together with the document it started from and
 * the ids of the clips it moved (the *incoming* clips). On the tracks that
 * changed, `settle`:
 *
 * 1. turns a partial overlap of two clips into a cross-fade pair;
 * 2. lets an incoming clip overwrite what it lands on when a cross-fade is
 *    impossible (containment, a third clip in the overlap) or not wanted
 *    (auto-crossfade off) — the clips under it are trimmed, split or removed;
 * 3. applies the same cuts to the linked partners of overwritten clips;
 * 4. sets every fade: overlap length on overlapping edges, 0 on edges that
 *    overlapped before the edit and no longer do, unchanged otherwise.
 *
 * Isomorphic and pure.
 * @module utils/edl/crossfade
 */

import { reuseClip } from './clipMath.js';
import { settleFades } from './fades.js';
import {
  compareClips,
  indexClips,
  isTimed,
  sameItems,
  sortClips,
  withTracks,
} from './immutable.js';
import { relinkCuts, spreadCuts } from './partners.js';
import { enforce, placeClip } from './place.js';
import { createSession, load, noteCut, rootId } from './session.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./session.js').Session} Session */
/** @typedef {import('./session.js').Work} Work */

const sameExcept = (a, b, skip) => Object.keys(b).every((k) => k === skip || a[k] === b[k]);

/**
 * The overlap rules of one track for this edit.
 *
 * - `fade`: a partial overlap may cross-fade when auto-crossfade is on,
 *   when the clip underneath is itself incoming, or when the two clips were
 *   cross-fading in the same order before the edit (so trimming or nudging
 *   one of them keeps the fade even with auto-crossfade off).
 * - `outranks`: in a conflict an incoming clip beats a clip that stayed
 *   put, which beats the remnant of an overwritten clip.
 * @param {Session} s
 * @param {Work} work
 * @returns {{ ctx: import('./place.js').PlaceContext,
 *   outranks: (a: Clip, b: Clip) => boolean }}
 */
function rulesFor(s, work) {
  const root = (clip) => rootId(s, clip.clipId);
  const rank = (clip) => (s.incoming.has(root(clip)) ? 2 : s.cuts.has(root(clip)) ? 0 : 1);
  const fadedBefore = (a, b) => {
    const [first, second] = compareClips(a, b) <= 0 ? [a, b] : [b, a];
    return s.was.get(root(first))?.next === root(second);
  };
  /** @type {import('./place.js').PlaceContext} */
  const ctx = {
    timed: (clip) => isTimed(clip, work.track),
    fade: (under, placed) => s.auto || rank(under) === 2 || fadedBefore(under, placed),
    onCut: (under, pieces, by) => noteCut(s, under, pieces, [by.timelineStart, by.timelineEnd]),
  };
  return { ctx, outranks: (a, b) => rank(a) > rank(b) };
}

/**
 * Place the incoming clips of one track over the clips that stayed put.
 * @param {Session} s
 * @param {Work} work
 */
function resolveTrack(s, work) {
  const moving = work.clips.filter((clip) => s.incoming.has(clip.clipId));
  if (!moving.length) return;
  const { ctx, outranks } = rulesFor(s, work);
  let placed = work.clips.filter((clip) => !s.incoming.has(clip.clipId));
  for (const clip of sortClips(moving)) placed = placeClip(placed, clip, ctx);
  work.clips = enforce(placed, ctx, outranks);
}

/**
 * Resolve overlaps and fades after an edit. See the module description.
 * @param {Edl} before - Valid document the operation started from
 * @param {Edl} after - Raw result: clips moved, trimmed, added or removed,
 *   fades not yet adjusted
 * @param {{ incoming?: Iterable<string>, autoCrossfade?: boolean, linked?: boolean }} [opts]
 *   `incoming`: ids of the clips that were moved or added (they win an
 *   overwrite); `linked: false` leaves linked partners out of overwrites
 * @returns {Edl} A document that satisfies invariants 3, 4 and 5; `before`
 *   itself when nothing changed
 */
export function settle(before, after, opts = {}) {
  if (after === before) return before;
  const s = createSession(before, after, opts);
  for (const track of after.tracks) if (s.prev.get(track.trackId) !== track) load(s, track);
  for (const work of [...s.work.values()]) resolveTrack(s, work);
  if (s.cuts.size) {
    const index = indexClips(after);
    const reached = opts.linked !== false ? spreadCuts(s, index) : [];
    // A partner that was cut may be left with a remnant inside a neighbour.
    for (const work of reached) {
      const { ctx, outranks } = rulesFor(s, work);
      work.clips = enforce(work.clips, ctx, outranks);
    }
    relinkCuts(s, index);
  }
  const was = (id) => s.was.get(rootId(s, id));
  const tracks = after.tracks.map((track) => {
    const work = s.work.get(track.trackId);
    if (!work) return track;
    const old = s.prev.get(track.trackId);
    const known = new Map((old?.clips || []).map((clip) => [clip.clipId, clip]));
    const faded = settleFades(sortClips(work.clips), was);
    const clips = faded.map((clip) => reuseClip(known.get(clip.clipId), clip));
    if (old && sameItems(old.clips, clips) && sameExcept(old, track, 'clips')) return old;
    return sameItems(track.clips, clips) ? track : { ...track, clips };
  });
  const out = withTracks(after, tracks);
  return sameItems(out.tracks, before.tracks) && sameExcept(before, out, 'tracks') ? before : out;
}
