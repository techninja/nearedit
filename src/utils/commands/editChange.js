/**
 * Working out what an edit did by comparing the document before and after
 * it — which clips it deleted, moved, trimmed or added, and therefore how a
 * ripple would follow it. This is what lets F ripple *after* the edit, the
 * Vegas way, whatever made the edit (a key, a drag, a menu). Pure.
 * @module utils/commands/editChange
 */

import { shiftClip } from '#utils/edl/clipMath.js';
import { neighbourOverlaps } from '#utils/edl/fades.js';
import { allClips } from '#utils/edl/query.js';
import { subtractSpans } from '#utils/edl/shift.js';
import { EPS, fpsOf } from '#utils/edl/time.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('#utils/edl/selectionEdits.js').EditChange} EditChange */
/** @typedef {{ clip: any, track: any }} Ref */

/** @type {(edl: Edl) => Map<string, Ref>} */
const byId = (edl) => new Map(allClips(edl).map((ref) => [ref.clip.clipId, ref]));
/** @type {(a: any, b: any) => boolean} The spans share more than an edge. */
const meet = (a, b) =>
  Math.min(a.timelineEnd, b.timelineEnd) - Math.max(a.timelineStart, b.timelineStart) > EPS;
const sameTrack = (a, b) => a.track.trackId === b.track.trackId;

/**
 * A clip that appeared is a piece when it is cut from a clip that was
 * there: same track, same material, inside the old clip's span.
 * @param {Ref} ref
 * @param {Ref[]} olds
 * @returns {boolean}
 */
function isPiece({ clip, track }, olds) {
  const offset = (c) => c.sourceIn - c.timelineStart;
  return olds.some(({ clip: old, track: home }) => {
    if (home.trackId !== track.trackId || old.sourceFile !== clip.sourceFile) return false;
    const inside =
      old.timelineStart <= clip.timelineStart + EPS && old.timelineEnd >= clip.timelineEnd - EPS;
    const sameSource = Math.abs(offset(old) - offset(clip)) < EPS || old.sourceIn === clip.sourceIn;
    return inside && sameSource && old.text?.content === clip.text?.content;
  });
}

/**
 * Sort the clips of an edit into what it placed and what it deleted. Clips
 * that only lost time to something placed over them (an overwrite), or to
 * their own pieces (a split), are neither.
 * @param {Map<string, Ref>} was
 * @param {Map<string, Ref>} now
 * @returns {{ added: Ref[], moved: Ref[], trimmed: Ref[], removed: Ref[] }}
 */
function sortEdit(was, now) {
  const olds = [...was.values()];
  const fresh = [...now.values()].filter((ref) => !was.has(ref.clip.clipId));
  const added = fresh.filter((ref) => !isPiece(ref, olds));
  /** @type {Record<'moved'|'grown'|'shrunk', Ref[]>} */
  const kept = { moved: [], grown: [], shrunk: [] };
  for (const [id, ref] of now) {
    const old = was.get(id);
    if (!old) continue;
    const dS = ref.clip.timelineStart - old.clip.timelineStart;
    const dE = ref.clip.timelineEnd - old.clip.timelineEnd;
    if (Math.abs(dS) < EPS && Math.abs(dE) < EPS && sameTrack(ref, old)) continue;
    const travelled = Math.abs(dS - dE) < EPS;
    kept[travelled ? 'moved' : dS < -EPS || dE > EPS ? 'grown' : 'shrunk'].push(ref);
  }
  const over = [...fresh, ...kept.moved, ...kept.grown];
  const covered = (old) =>
    over.some((ref) => sameTrack(ref, old) && ref.clip !== old.clip && meet(ref.clip, old.clip));
  const lostTo = (ref) => {
    const old = was.get(ref.clip.clipId);
    const lost = (a, b) =>
      b - a > EPS && covered({ ...old, clip: { timelineStart: a, timelineEnd: b } });
    return (
      lost(old.clip.timelineStart, ref.clip.timelineStart) ||
      lost(ref.clip.timelineEnd, old.clip.timelineEnd)
    );
  };
  const trimmed = [...kept.grown, ...kept.shrunk.filter((ref) => !lostTo(ref))];
  const removed = olds.filter((old) => !now.has(old.clip.clipId) && !covered(old));
  return { added, moved: kept.moved, trimmed, removed };
}

/**
 * Describe an edit for `replayRippled`.
 * @param {Edl} before
 * @param {Edl} after
 * @returns {EditChange|null} null when there is nothing a ripple could follow
 */
export function describeEdit(before, after) {
  const ids = new Set(after.tracks.map((track) => track.trackId));
  if (before === after || before.tracks.some((track) => !ids.has(track.trackId))) return null;
  const [was, now] = [byId(before), byId(after)];
  const { added, moved, trimmed, removed } = sortEdit(was, now);
  // Clips deleted and others put in at once is a replacement (a director edit), not a ripple.
  if (removed.length && added.length) return null;
  /** @type {import('#utils/edl/selectionEdits.js').RippleStep[]} */
  const steps = [];
  /** @type {Map<string, number>} */
  const carry = new Map();
  const old = (ref) => was.get(ref.clip.clipId).clip;
  if (removed.length) {
    const lanes = new Set(removed.map((ref) => ref.track.trackId));
    const spanOf = ({ clip }) =>
      /** @type {[number, number]} */ ([clip.timelineStart, clip.timelineEnd]);
    const left = allClips(after).filter((ref) => lanes.has(ref.track.trackId));
    for (const [a, b] of subtractSpans(removed.map(spanOf), left.map(spanOf))) {
      steps.push({ from: b, by: a - b });
    }
  }
  if (added.length) {
    const from = Math.min(...added.map((ref) => ref.clip.timelineStart));
    const to = Math.max(...added.map((ref) => ref.clip.timelineEnd));
    steps.push({ from, by: to - from, open: true });
  }
  const travel = (ref) => ref.clip.timelineStart - old(ref).timelineStart;
  const leader = moved.reduce(
    (a, b) => (!a || old(b).timelineStart < old(a).timelineStart ? b : a),
    null,
  );
  if (leader) steps.push({ from: old(leader).timelineStart, by: travel(leader) });
  for (const ref of trimmed) {
    const [o, n] = [old(ref), ref.clip];
    const fading = neighbourOverlaps(was.get(n.clipId).track.clips).get(n.clipId)?.out || 0;
    const [dS, dE] = [n.timelineStart - o.timelineStart, n.timelineEnd - o.timelineEnd];
    if (Math.abs(dE) > EPS) steps.push({ from: o.timelineEnd - fading, by: dE });
    if (Math.abs(dS) < EPS) continue;
    steps.push({ from: Math.min(o.timelineStart, n.timelineStart), by: -dS });
    carry.set(n.clipId, -dS);
  }
  const key = (step) => `${Math.round(step.from * 1e4)}|${Math.round(step.by * 1e4)}`;
  const unique = steps.filter((step, i) => steps.findIndex((s) => key(s) === key(step)) === i);
  if (Math.abs(unique.reduce((sum, step) => sum + step.by, 0)) < EPS) return null;
  const subjects = [...added, ...moved, ...trimmed];
  const placed = subjects.map(({ clip, track }) => {
    const overlap = neighbourOverlaps(track.clips).get(clip.clipId);
    const prior = was.get(clip.clipId)?.clip;
    const fadeIn = overlap?.in > EPS ? prior?.fadeIn || 0 : clip.fadeIn;
    const fadeOut = overlap?.out > EPS ? prior?.fadeOut || 0 : clip.fadeOut;
    const back = shiftClip({ ...clip, fadeIn, fadeOut }, carry.get(clip.clipId) || 0, fpsOf(after));
    return { trackId: track.trackId, clip: back };
  });
  const trackIds = [...new Set([...subjects, ...removed].map((ref) => ref.track.trackId))];
  const gone = removed.map((ref) => ref.clip.clipId);
  return { steps: unique, trackIds, removed: gone, placed, tracks: after.tracks };
}
