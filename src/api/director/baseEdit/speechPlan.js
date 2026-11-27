/**
 * Base edit, speech-led: choose which stretch of each speech file to use
 * so the total comes out near the target length. Picks are whole
 * transcript segments, so they start and end on sentences; the assembler
 * then removes the dead air inside them.
 * @module api/director/baseEdit/speechPlan
 */

import { runsFromSilences } from '#utils/director/tighten.js';
import { round3 } from '#utils/director/snap.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {{ start: number, end: number, words: number }} Unit
 */

/** A speech file given less than this many seconds is left out instead. */
const MIN_SHARE = 4;

/**
 * The units a speech file can be cut into: transcript segments, else the
 * stretches between detected silences, else the whole file.
 * @param {MediaInfo} m
 * @param {number} threshold - Pause length that counts as dead air
 * @returns {Unit[]}
 */
export function speechUnits(m, threshold) {
  if (m.segments.length) {
    return m.segments.map((s) => ({
      start: s.start,
      end: s.end,
      words: m.words.filter((w) => w.start >= s.start - 0.01 && w.end <= s.end + 0.01).length,
    }));
  }
  const length = m.duration ?? 0;
  if (!(length > 0)) return [];
  const runs = m.silences.length
    ? runsFromSilences(m.silences, 0, length, { threshold, padding: 0 })
    : [{ start: 0, end: length }];
  return runs.map((r) => ({ ...r, words: 0 }));
}

/**
 * Spoken length of units[from..to] once pauses longer than `threshold`
 * between them are cut.
 * @param {Unit[]} units
 * @param {number} from
 * @param {number} to
 * @param {number} threshold
 * @returns {number}
 */
export function spokenLength(units, from, to, threshold) {
  let total = 0;
  for (let i = from; i <= to; i++) {
    total += units[i].end - units[i].start;
    const gap = i < to ? units[i + 1].start - units[i].end : 0;
    if (gap > 0 && gap <= threshold) total += gap;
  }
  return total;
}

/**
 * The run of consecutive units whose spoken length is closest to `share`.
 * Among near-equal fits the most fluent one (most words per second) wins,
 * then the earliest.
 * @param {Unit[]} units
 * @param {number} share - Seconds wanted from this file
 * @param {number} threshold
 * @returns {{ from: number, to: number, seconds: number }}
 */
export function bestWindow(units, share, threshold) {
  const windows = [];
  for (let from = 0; from < units.length; from++) {
    let words = 0;
    let seconds = 0;
    for (let to = from; to < units.length; to++) {
      const gap = to > from ? units[to].start - units[to - 1].end : 0;
      seconds += units[to].end - units[to].start + (gap > 0 && gap <= threshold ? gap : 0);
      words += units[to].words;
      windows.push({
        from,
        to,
        seconds,
        miss: Math.abs(seconds - share),
        density: words / seconds,
      });
      if (seconds > share * 1.3) break;
    }
  }
  const closest = Math.min(...windows.map((w) => w.miss));
  const fits = windows.filter((w) => w.miss <= closest + share * 0.1);
  return fits.reduce((best, w) => (w.density > best.density + 1e-9 ? w : best));
}

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
