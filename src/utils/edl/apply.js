/**
 * Merging a DirectorResult into the timeline (API.md § DirectorResult), so
 * that every automated edit is one ordinary, undoable document change.
 * Isomorphic and pure.
 * @module utils/edl/apply
 */

import { shiftClip } from './clipMath.js';
import { timelineDuration } from './query.js';
import { prepareFragment } from './fragment.js';
import { adoptLayout } from './fragmentLayout.js';
import { mapClips, tracksOfType } from './immutable.js';
import { repairLinks } from './links.js';
import { addClips, ensureTrack } from './placement.js';
import { rippleDeleteRange, rippleInsert } from './ripple.js';
import { isObject, toNumber } from './sanitize.js';
import { fpsOf, snap } from './time.js';
import { addTrack } from './trackOps.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./fragment.js').Fragment} Fragment */

/**
 * Put the fragment's clips and markers on the timeline at `offset`.
 * Fragment tracks map to the Nth track of their type; missing tracks are
 * created below the existing ones of that type. A locked target is never
 * written: its clips go to a new track instead.
 * @param {Edl} edl
 * @param {Fragment} fragment
 * @param {number} offset
 * @returns {Edl}
 */
function placeFragment(edl, fragment, offset) {
  let doc = edl;
  for (const part of fragment.tracks) doc = ensureTrack(doc, part.type, part.row, part.name).edl;
  /** @type {Map<string, string>} */
  const detours = new Map();
  const items = [];
  for (const part of fragment.tracks) {
    const target = ensureTrack(doc, part.type, part.row).track;
    let trackId = target.trackId;
    if (target.locked && part.clips.length) {
      if (!detours.has(trackId)) {
        doc = addTrack(doc, part.type, { position: 'bottom' });
        const lane = tracksOfType(doc, part.type);
        detours.set(trackId, lane[lane.length - 1].trackId);
      }
      trackId = detours.get(trackId);
    }
    for (const clip of part.clips) {
      items.push({ trackId, clip: shiftClip(clip, offset, fpsOf(edl)) });
    }
  }
  doc = addClips(doc, items);
  if (!fragment.markers.length) return doc;
  const added = fragment.markers.map((m) => ({ ...m, time: snap(edl, m.time + offset) }));
  return { ...doc, markers: [...(doc.markers || []), ...added].sort((a, b) => a.time - b.time) };
}

/**
 * Clip and group ids in use in a document.
 * @param {Edl} edl
 * @returns {{ clipIds: Set<string>, groupIds: Set<string> }}
 */
function idsIn(edl) {
  const clips = edl.tracks.flatMap((track) => track.clips);
  return {
    clipIds: new Set(clips.map((clip) => clip.clipId)),
    groupIds: new Set(clips.map((clip) => clip.groupId).filter(Boolean)),
  };
}

/**
 * Merge a DirectorResult into the document.
 *
 * - `replace`: the fragment becomes the timeline. Clips on unlocked tracks
 *   and all markers are removed first, and the tracks take the result's
 *   layout (`adoptLayout`): rows are named as the result names them and
 *   keep the existing track they refer to by `trackId`.
 * - `append`: the fragment starts where the timeline ends.
 * - `prepend`: everything moves right by the fragment's length.
 * - `insert`: ripple-insert at `result.at` — clips crossing that time are
 *   split and everything after moves right.
 * - `range`: `result.range` is cut out and the fragment takes its place;
 *   later clips ripple by the difference in length.
 *
 * Ripples reach every unlocked track and the markers. Clips on locked
 * tracks never change. An unknown mode, an `insert` without `at` or a
 * `range` without a usable range falls back to `append`, which never
 * destroys anything.
 * @param {Edl} edl
 * @param {any} result - DirectorResult
 * @returns {Edl} A document that satisfies `validateEdl`
 */
export function applyDirectorResult(edl, result) {
  if (!isObject(result)) return edl;
  const replacing = result.mode === 'replace';
  const base = replacing ? repairLinks(mapClips(adoptLayout(edl, result), () => null)) : edl;
  const fragment = prepareFragment(result, fpsOf(edl), idsIn(base));
  const length = fragment.duration;
  const at = toNumber(result.at, NaN);
  const start = toNumber(result.range?.start, NaN);
  const end = toNumber(result.range?.end, NaN);
  const ripple = { markers: true };

  if (replacing) return placeFragment({ ...base, markers: [] }, fragment, 0);
  if (result.mode === 'prepend') {
    return placeFragment(rippleInsert(edl, 0, length, ripple), fragment, 0);
  }
  if (result.mode === 'insert' && Number.isFinite(at)) {
    const offset = Math.max(0, snap(edl, at));
    return placeFragment(rippleInsert(edl, offset, length, ripple), fragment, offset);
  }
  if (result.mode === 'range' && Number.isFinite(start) && end > Math.max(0, start)) {
    const offset = snap(edl, Math.max(0, start));
    const cut = rippleDeleteRange(edl, offset, end, ripple);
    return placeFragment(rippleInsert(cut, offset, length, ripple), fragment, offset);
  }
  return placeFragment(edl, fragment, snap(edl, timelineDuration(edl)));
}
