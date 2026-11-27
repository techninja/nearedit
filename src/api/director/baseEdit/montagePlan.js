/**
 * Base edit, picture-led: choose shots for a montage. Every picture file
 * gets a turn before any is used twice; within a file the longest shots
 * are used, trimmed to their middle; long single takes are sampled at
 * even intervals. Works from probe data alone.
 * @module api/director/baseEdit/montagePlan
 */

import { round3 } from '#utils/director/snap.js';
import { shotsOf } from '../assemble/usable.js';

/** @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo */

const MAX_SHOTS_PER_FILE = 8;

/**
 * Shot length for a pacing, stretched to a whole (preferably even) number
 * of beats when the music has a tempo.
 * @param {number} seconds - Length the pacing asks for
 * @param {number|null} bpm
 * @returns {number}
 */
export function shotLength(seconds, bpm) {
  if (!bpm) return seconds;
  const beat = 60 / bpm;
  let beats = Math.max(1, Math.round(seconds / beat));
  if (beats > 2 && beats % 2) beats += 1;
  return beats * beat;
}

/**
 * How many shots each source gives so that `count` are taken in all:
 * one each first (an even spread of the sources when there are too many),
 * then extras to the files with the most footage left.
 * @param {number[]} capacity - Most shots each source can give
 * @param {number} count
 * @returns {number[]}
 */
export function allotShots(capacity, count) {
  const n = capacity.length;
  const allot = capacity.map(() => 0);
  if (count <= n) {
    for (let i = 0; i < count; i++) allot[Math.round((i * (n - 1)) / Math.max(1, count - 1))] = 1;
    return allot;
  }
  allot.fill(1);
  for (let left = count - n; left > 0; left--) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (allot[i] >= capacity[i]) continue;
      if (best < 0 || capacity[i] - allot[i] > capacity[best] - allot[best]) best = i;
    }
    if (best < 0) break;
    allot[best]++;
  }
  return allot;
}

/**
 * `count` takes of about `seconds` from one video, in source order.
 * @param {MediaInfo} m
 * @param {number} count
 * @param {number} seconds
 * @returns {{ start: number, end: number }[]}
 */
export function takesFrom(m, count, seconds) {
  const shots = shotsOf(m);
  if (!shots.length) return [{ start: 0, end: seconds }];
  const middle = (/** @type {{ start: number, end: number }} */ span) => {
    const length = Math.min(seconds, span.end - span.start);
    const start = span.start + (span.end - span.start - length) / 2;
    return { start: round3(start), end: round3(start + length) };
  };
  if (shots.length >= count) {
    const longest = [...shots].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, count);
    return longest.sort((a, b) => a.start - b.start).map(middle);
  }
  // Fewer shots than takes: sample the whole file at even intervals.
  const from = shots[0].start;
  const slot = (shots.at(-1).end - from) / count;
  return Array.from({ length: count }, (_, i) =>
    middle({ start: from + i * slot, end: from + (i + 1) * slot }),
  );
}

/**
 * Plan a montage.
 * @param {MediaInfo[]} sources - Picture files and stills, in story order
 * @param {{ duration: number, shot: number, still: number, role: 'broll'|'primary' }} params
 * @returns {{ picks: object[], seconds: number, notes: string[] }}
 */
export function planMontage(sources, params) {
  const { duration: target, role } = params;
  let { shot } = params;
  const isStill = (/** @type {MediaInfo} */ m) => m.type === 'image';
  const capacityFor = (/** @type {number} */ length) =>
    sources.map((m) =>
      isStill(m) || !m.duration
        ? 1
        : Math.max(1, Math.min(MAX_SHOTS_PER_FILE, Math.floor(m.duration / (length * 1.2)))),
    );
  const longest = shot * 2;
  let count = Math.max(1, Math.round(target / shot));
  let capacity = [];
  // Settle the shot count and length together: spread the rounding over the
  // shots so the montage lands on the target, and when there is not enough
  // material for that many shots, hold fewer shots for longer.
  for (let pass = 0; pass < 4; pass++) {
    shot = Math.max(shot * 0.7, Math.min(longest, target / count));
    capacity = capacityFor(shot);
    const room = capacity.reduce((a, b) => a + b, 0);
    if (room >= count) break;
    count = room;
  }
  const allot = allotShots(capacity, count);
  const picks = [];
  let seconds = 0;
  sources.forEach((m, i) => {
    if (!allot[i]) return;
    if (isStill(m)) {
      picks.push({ file: m.handle, duration: round3(params.still) });
      seconds += params.still;
      return;
    }
    for (const take of takesFrom(m, allot[i], shot)) {
      picks.push({ file: m.handle, role, ...take });
      seconds += take.end - take.start;
    }
  });
  const notes = [];
  if (seconds < target * 0.8)
    notes.push(
      `There is only enough picture for about ${Math.round(seconds)}s of the ${Math.round(target)}s target.`,
    );
  return { picks, seconds, notes };
}
