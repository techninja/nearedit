/**
 * Which part of a file a pick means: transcript segment numbers, a scene
 * number or rough times, turned into a rough source range.
 * @module api/director/plan/parts
 */

import { round3 } from '#utils/director/snap.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {Object} ResolvedPart
 * @property {MediaInfo} media
 * @property {number|null} start - Rough source in; null lets the assembler choose
 * @property {number|null} end - Rough source out; null lets the assembler choose
 * @property {number|null} duration - Requested length when there is no `end`
 * @property {'segments'|'scene'|'times'|'auto'} basis - Where the range came from
 */

/**
 * Split a pick's segment numbers into contiguous runs, each [first, last].
 * Two numbers are a range (`[3, 9]` is segments 3 to 9); longer lists are
 * grouped wherever the numbers are consecutive.
 * @param {{ segments?: number[] }} pick
 * @param {MediaInfo} m
 * @param {string} label
 * @param {string[]} notes
 * @returns {(number[]|undefined)[]} One entry per resulting pick; [undefined] when
 *   the pick has no usable segment numbers
 */
export function segmentRuns(pick, m, label, notes) {
  if (!pick.segments?.length) return [undefined];
  const total = m.segments.length;
  if (!total) {
    notes.push(`${label}: ${m.filename} has no transcript — segment numbers ignored.`);
    return [undefined];
  }
  const valid = [...new Set(pick.segments)]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  if (valid.length < new Set(pick.segments).size)
    notes.push(
      `${label}: ${m.filename} has segments 1–${total}; numbers outside that were ignored.`,
    );
  if (!valid.length) return [undefined];
  if (pick.segments.length === 2) return [[valid[0], valid.at(-1)]];
  const runs = [];
  for (const n of valid) {
    const run = runs.at(-1);
    if (run && n === run[1] + 1) run[1] = n;
    else runs.push([n, n]);
  }
  return runs;
}

/**
 * Resolve the part of `m` a pick or visual refers to.
 * @param {{ start?: number, end?: number, segments?: number[], scene?: number,
 *   duration?: number }} raw - `segments` already reduced to one [first, last] run
 * @param {MediaInfo} m
 * @param {string} label
 * @param {string[]} notes
 * @returns {ResolvedPart}
 */
export function resolvePart(raw, m, label, notes) {
  const length = m.duration ?? Infinity;
  const duration = raw.duration > 0 ? raw.duration : null;
  /** @type {ResolvedPart} */
  const auto = { media: m, start: null, end: null, duration, basis: 'auto' };
  if (m.type === 'image') return auto;

  if (raw.segments?.length && m.segments.length) {
    const first = m.segments[raw.segments[0] - 1];
    const last = m.segments[raw.segments.at(-1) - 1];
    if (first && last)
      return { media: m, start: first.start, end: last.end, duration: null, basis: 'segments' };
  }
  if (raw.scene !== undefined && raw.start === undefined) {
    const scene = m.scenes[raw.scene - 1];
    if (scene) return { media: m, start: scene.start, end: scene.end, duration, basis: 'scene' };
    notes.push(
      `${label}: ${m.filename} has no shot ${raw.scene} — the best part was chosen instead.`,
    );
    return auto;
  }
  if (raw.start === undefined && raw.end === undefined) return auto;

  let start = raw.start ?? 0;
  let end = raw.end ?? null;
  if (end !== null && end < start) [start, end] = [end, start];
  if (start >= length - 0.1) {
    notes.push(
      `${label}: ${round3(start)}s is past the end of ${m.filename} — the best part was chosen instead.`,
    );
    return auto;
  }
  if (end !== null && end > length) end = length;
  if (end !== null && end - start < 0.05) end = null;
  return { media: m, start, end, duration, basis: 'times' };
}
