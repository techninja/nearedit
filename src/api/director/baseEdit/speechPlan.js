/**
 * Base edit, speech-led: choose which stretch of each speech file to use
 * so the total comes out near the target length. Picks are whole
 * transcript segments, so they start and end on sentences; the assembler
 * then removes the dead air inside them.
 * @module api/director/baseEdit/speechPlan
 */

import { round3 } from '#utils/director/snap.js';
import { bestWindow, speechUnits, spokenLength } from './speechWindow.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {import('./speechWindow.js').Unit} Unit
 */

/** A speech file given less than this many seconds is left out instead. */
const MIN_SHARE = 4;

/**
 * Plan the speech of a talking-head edit.
 * @param {MediaInfo[]} sources - Speech-led files, in story order
 * @param {{ duration: number, threshold: number }} params
 * @returns {{ picks: object[], seconds: number, total: number, notes: string[] }} `seconds` is
 *   the planned speech, `total` all the speech there is
 */
export function planSpeech(sources, params) {
  const { duration: target, threshold } = params;
  const files = sources
    .map((m) => ({ m, units: speechUnits(m, threshold) }))
    .filter((f) => f.units.length)
    .map((f) => ({ ...f, all: spokenLength(f.units, 0, f.units.length - 1, threshold) }));
  const total = files.reduce((sum, f) => sum + f.all, 0);
  const role = (/** @type {MediaInfo} */ m) => (m.type === 'video' ? 'primary' : 'narration');
  const pick = (/** @type {MediaInfo} */ m, /** @type {Unit[]} */ units, from, to) => ({
    file: m.handle,
    role: role(m),
    start: round3(units[from].start),
    end: round3(units[to].end),
  });
  if (total <= target * 1.15) {
    const picks = files.map((f) => pick(f.m, f.units, 0, f.units.length - 1));
    return { picks, seconds: total, total, notes: [] };
  }
  // Too much speech: give each file a share of the target in proportion to
  // what it holds, dropping files whose share would be a mere fragment.
  const notes = [];
  let used = files;
  const keep = Math.max(1, Math.floor(target / MIN_SHARE));
  if (used.length > keep) {
    used = Array.from(
      { length: keep },
      (_, i) => files[Math.round((i * (files.length - 1)) / Math.max(1, keep - 1))],
    );
    used = [...new Set(used)];
    notes.push(
      `${files.length - used.length} speech files were left out to fit the target length.`,
    );
  }
  const pool = used.reduce((sum, f) => sum + f.all, 0);
  const picks = [];
  let seconds = 0;
  for (const f of used) {
    const window = bestWindow(f.units, (target * f.all) / pool, threshold);
    picks.push(pick(f.m, f.units, window.from, window.to));
    seconds += window.seconds;
  }
  return { picks, seconds, total, notes };
}
