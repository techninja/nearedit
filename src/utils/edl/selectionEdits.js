/**
 * Edits around the time selection and the clipboard — trim to a range,
 * paste insert, paste repeat — and the replay behind post-edit ripple: an
 * edit done again from the document it started on, with later clips (and
 * optionally markers and regions) following it. Isomorphic and pure.
 * @module utils/edl/selectionEdits
 */

import { deleteClips } from './clipEdit.js';
import { pasteClips } from './clipboard.js';
import { settle } from './crossfade.js';
import { idList, indexClips, mapClips, withClips } from './immutable.js';
import { repairLinks } from './links.js';
import { retimeMarkers } from './markers.js';
import { retimeRegions } from './regions.js';
import { shiftClips } from './shift.js';
import { splitClips } from './split.js';
import { EPS, snap } from './time.js';
import { trimClipEnd, trimClipStart } from './trim.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./clipboard.js').Clipboard} Clipboard */
/**
 * One movement of a ripple: everything at or after `from` moves by `by`
 * seconds. `open` inserts time, so clips lying across `from` are split.
 * @typedef {{ from: number, by: number, open?: boolean }} RippleStep
 */
/**
 * What an edit did, as post-edit ripple needs it.
 * @typedef {Object} EditChange
 * @property {RippleStep[]} steps
 * @property {string[]} trackIds - Tracks the edit worked on
 * @property {string[]} removed - Ids of the clips the edit deleted
 * @property {{ trackId: string, clip: any }[]} placed - Clips it moved, trimmed or added
 * @property {import('./types.js').Track[]} tracks - Tracks after the edit (it may add some)
 */

/** Most copies one paste repeat makes. */
export const MAX_REPEATS = 500;

/**
 * Trim clips to a time range: what lies outside it is cut away, and a clip
 * that is wholly outside is deleted. Nothing moves.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds - Pass linked partners too
 * @param {number} start
 * @param {number} end
 * @param {import('./trim.js').TrimOptions} [opts]
 * @returns {Edl}
 */
export function trimToRange(edl, clipIds, start, end, opts = {}) {
  const [from, to] = [snap(edl, Math.min(start, end)), snap(edl, Math.max(start, end))];
  const index = indexClips(edl);
  const ids = idList(clipIds).filter((id) => index.has(id) && !index.get(id).track.locked);
  if (!(to - from > EPS) || !ids.length) return edl;
  const span = (id) => index.get(id).clip;
  const outside = (id) => span(id).timelineEnd <= from + EPS || span(id).timelineStart >= to - EPS;
  const plain = { ...opts, linked: false, ripple: false };
  let doc = deleteClips(edl, ids.filter(outside), { linked: false });
  for (const id of ids.filter((each) => !outside(each))) {
    doc = trimClipStart(doc, id, Math.max(from, span(id).timelineStart), plain);
    doc = trimClipEnd(doc, id, Math.min(to, span(id).timelineEnd), plain);
  }
  return doc;
}

/**
 * Paste insert: open a gap for the payload on every unlocked track (markers
 * and regions move too), then paste into it.
 * @param {Edl} edl
 * @param {Clipboard|null} clipboard
 * @param {{ time?: number, trackId?: string, autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function pasteInsert(edl, clipboard, opts = {}) {
  const pasted = pasteClips(edl, clipboard, { ...opts, ripple: true });
  const at = Math.max(0, snap(edl, opts.time || 0));
  const length = snap(edl, Number(clipboard?.duration) || 0);
  return pasted === edl ? edl : retimeRegions(pasted, (t) => (t >= at - EPS ? t + length : t));
}

/**
 * Paste repeat: paste the payload `count` times, end to end or at a fixed
 * interval (`every` seconds from one start to the next).
 * @param {Edl} edl
 * @param {Clipboard|null} clipboard
 * @param {{ time?: number, trackId?: string, count?: number, every?: number,
 *   autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function pasteRepeat(edl, clipboard, opts = {}) {
  const count = Math.max(1, Math.min(MAX_REPEATS, Math.floor(opts.count) || 1));
  const every = snap(edl, opts.every > 0 ? opts.every : Number(clipboard?.duration) || 0);
  const at = Math.max(0, snap(edl, opts.time || 0));
  let doc = edl;
  for (let i = 0; i < count && every > EPS; i++) {
    doc = pasteClips(doc, clipboard, { ...opts, ripple: false, time: at + i * every });
  }
  return doc;
}

/**
 * Markers and regions follow ripple steps; what a closing step swallows
 * gathers at the point it closes to.
 * @param {Edl} edl
 * @param {RippleStep[]} steps
 * @returns {Edl}
 */
export function rippleMarks(edl, steps) {
  const before = (time, { from }) => time < from - EPS;
  const move = (time) =>
    Math.min(time, ...steps.map((step) => (before(time, step) ? step.from + step.by : time))) +
    steps.reduce((sum, step) => (before(time, step) ? sum : sum + step.by), 0);
  return retimeRegions(retimeMarkers(edl, move), move);
}

/**
 * Replay an edit with a ripple. From the document before the edit: take
 * out what the edit moved or deleted, shift what comes after each step, and
 * put the edited clips back — so nothing a plain edit overwrote is lost.
 * @param {Edl} before - Document the edit started from
 * @param {EditChange} change
 * @param {{ scope?: 'track'|'marks'|'all', autoCrossfade?: boolean }} [opts] - `track`: the
 *   tracks the edit worked on; `marks`: plus markers and regions; `all`: every track as well
 * @returns {Edl}
 */
export function replayRippled(before, change, opts = {}) {
  const lanes = new Set(change.trackIds);
  const inScope = (track) => !track.locked && (opts.scope === 'all' || lanes.has(track.trackId));
  const trackIds = before.tracks.filter(inScope).map((track) => track.trackId);
  const incoming = change.placed.map((item) => item.clip.clipId);
  const gone = new Set([...incoming, ...change.removed]);
  let doc = mapClips(before, (clip) => (gone.has(clip.clipId) ? null : clip));
  for (const { from, by, open } of [...change.steps].sort((a, b) => b.from - a.from)) {
    if (open) doc = splitClips(doc, from, { trackIds, linked: false, cutFades: true });
    const follows = (clip, track) => inScope(track) && clip.timelineStart >= from - EPS;
    const shifted = shiftClips(doc, (clip, track) => (follows(clip, track) ? by : 0));
    doc = shifted.edl;
    incoming.push(...shifted.moved);
  }
  if (opts.scope === 'marks' || opts.scope === 'all') doc = rippleMarks(doc, change.steps);
  const rest = new Map(doc.tracks.map((track) => [track.trackId, track]));
  const tracks = change.tracks.map((home) => {
    const track = rest.get(home.trackId) || { ...home, clips: [] };
    const back = change.placed.filter((item) => item.trackId === home.trackId);
    return back.length ? withClips(track, [...track.clips, ...back.map((b) => b.clip)]) : track;
  });
  const raw = repairLinks({ ...doc, tracks });
  return settle(before, raw, { incoming, autoCrossfade: opts.autoCrossfade });
}
