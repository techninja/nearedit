/**
 * Picture timing: choosing the most usable part of a clip and snapping
 * rough cut points to shot boundaries.
 * @module api/director/assemble/usable
 */

import { clamp, snapNear } from '#utils/director/snap.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {import('#utils/director/speech.js').Span} Span
 */

/** A cut this close to a shot boundary is moved onto it. */
export const SCENE_TOLERANCE = 0.5;

/**
 * The shots of a file: its detected scenes, or the whole file as one shot.
 * @param {MediaInfo} media
 * @returns {Span[]} Empty when the length is unknown and nothing was detected
 */
export function shotsOf(media) {
  const length = media.duration ?? Infinity;
  const scenes = media.scenes
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(length, s.end) }))
    .filter((s) => s.end - s.start > 0.1);
  if (scenes.length) return scenes;
  return media.duration ? [{ start: 0, end: media.duration }] : [];
}

/**
 * The most usable `need` seconds of a picture file. Prefers a shot long
 * enough to hold the whole length, takes the middle of it (the first and
 * last moments of a shot are where cameras start, stop and wobble), and
 * rotates through the shots on repeated use.
 * @param {MediaInfo} media
 * @param {number} need - Seconds wanted
 * @param {{ near?: number|null, use?: number }} [opts] - `near`: a source time the
 *   part should include; `use`: how many times this file was used before
 * @returns {Span} May be shorter than `need` when the shot is
 */
export function usablePart(media, need, opts = {}) {
  const shots = shotsOf(media);
  if (!shots.length) return { start: 0, end: need };
  const near = opts.near ?? null;
  let shot;
  if (near !== null) {
    shot = shots.find((s) => near >= s.start && near < s.end) || shots[0];
  } else {
    const length = (/** @type {Span} */ s) => s.end - s.start;
    const ranked = [...shots].sort(
      (a, b) => Number(length(b) >= need) - Number(length(a) >= need) || length(b) - length(a),
    );
    shot = ranked[(opts.use || 0) % ranked.length];
  }
  const length = shot.end - shot.start;
  if (length <= need) return { ...shot };
  const margin = Math.min(0.5, length * 0.1, (length - need) / 2);
  const centred = shot.start + (length - need) / 2;
  const wanted = near !== null ? near - need * 0.25 : centred;
  const start = clamp(wanted, shot.start + margin, shot.end - margin - need);
  return { start, end: start + need };
}

/**
 * Snap the ends of a rough picture range to shot boundaries where one is
 * close, and keep the range inside the file.
 * @param {MediaInfo} media
 * @param {number} start
 * @param {number} end
 * @param {number} [tolerance]
 * @returns {Span & { snapped: number }} `snapped` counts the ends that moved (0–2)
 */
export function alignPicture(media, start, end, tolerance = SCENE_TOLERANCE) {
  const length = media.duration ?? Infinity;
  const edges = [...new Set(media.scenes.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  let a = snapNear(start, edges, tolerance);
  let b = snapNear(end, edges, tolerance);
  // Both ends on the same boundary would leave nothing: keep the rough range.
  if (b - a < 0.2) [a, b] = [start, end];
  const snapped = Number(a !== start) + Number(b !== end);
  return { start: clamp(a, 0, length), end: clamp(b, 0, length), snapped };
}
