/**
 * Putting brand elements on a timeline for the director, through the
 * editor's own operation (`insertElement`): the clip that was made is
 * handed back so it can be marked and reported, and a place is checked to
 * be free before anything is laid on it — the director never leaves two
 * clips fighting over one stretch of a track.
 * Isomorphic and pure.
 * @module utils/director/brand/place
 */

import { coverTime, resolveElement } from '#utils/brand/index.js';
import { cutTimes } from '#utils/edl/elementInsert.js';
import { findClip, insertElement, newClipIds, snapToFrame, updateClip } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('#utils/brand/types.js').Kit} Kit */

const EPS = 1e-6;

/**
 * @param {{ clips: any[] } | undefined} track
 * @param {number} start
 * @param {number} end
 * @param {string} [except] - A clip that does not count
 * @returns {any|undefined} The first clip of the track inside the span
 */
export function blocker(track, start, end, except = '') {
  return [...(track?.clips || [])]
    .sort((a, b) => a.timelineStart - b.timelineStart)
    .find(
      (clip) =>
        clip.clipId !== except && clip.timelineEnd > start + EPS && clip.timelineStart < end - EPS,
    );
}

/**
 * Insert an element and find the clip it became.
 * @param {Edl} edl
 * @param {Kit} kit
 * @param {string} elementId
 * @param {Record<string, string>} slots
 * @param {{ time?: number, duration?: number, trackId?: string, ripple?: boolean,
 *   intent?: string, label?: string }} [opts] - As `insertElement`; `intent`
 *   marks the clip (who placed it, as what)
 * @returns {{ edl: Edl, clip: any }|null} null when the kit has no such element
 */
export function putElement(edl, kit, elementId, slots, opts = {}) {
  const { intent, ...where } = opts;
  const next = insertElement(edl, kit, elementId, slots, { autoCrossfade: false, ...where });
  if (next === edl) return null;
  const made = newClipIds(edl, next)
    .map((id) => findClip(next, id))
    .find((ref) => ref?.clip.element?.id === elementId);
  if (!made) return null;
  const doc = intent ? updateClip(next, made.clip.clipId, { intent }) : next;
  return { edl: doc, clip: findClip(doc, made.clip.clipId).clip };
}

/**
 * The cut of the picture nearest a time.
 * @param {Edl} edl
 * @param {number} time
 * @param {number} [within] - Seconds; a cut further away does not count
 * @returns {number|null}
 */
export function nearestCut(edl, time, within = Infinity) {
  const cuts = cutTimes(edl);
  if (!cuts.length) return null;
  const cut = cuts.reduce((best, at) => (Math.abs(at - time) < Math.abs(best - time) ? at : best));
  return Math.abs(cut - time) <= within + EPS ? cut : null;
}

/**
 * The stretch a transition element takes when its covered moment is put on
 * a cut.
 * @param {Edl} edl
 * @param {Kit} kit
 * @param {string} elementId - A transition of the kit
 * @param {number} cut - Timeline seconds
 * @returns {{ start: number, end: number }|null} null when the kit has no such element
 */
export function coverSpan(edl, kit, elementId, cut) {
  const design = resolveElement(kit, elementId);
  if (!design) return null;
  const fps = Number(edl.fps) || 30;
  const length = snapToFrame(design.duration, fps);
  const start = Math.max(0, snapToFrame(cut - coverTime(design, length), fps));
  return { start, end: snapToFrame(start + length, fps) };
}
