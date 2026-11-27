/**
 * Speech units and windows for the base edit: what a speech file can be
 * cut into, and which run of consecutive units best fits a length.
 * @module api/director/baseEdit/speechWindow
 */

import { runsFromSilences } from '#utils/director/tighten.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {{ start: number, end: number, words: number }} Unit
 */

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
  /**
   * Visit every run of consecutive units up to a little over the share.
   * (Scanned twice rather than stored: a long transcript has millions.)
   * @param {(w: { from: number, to: number, seconds: number, miss: number,
   *   density: number }) => void} visit
   */
  const scan = (visit) => {
    for (let from = 0; from < units.length; from++) {
      let words = 0;
      let spoken = 0;
      let seconds = 0;
      for (let to = from; to < units.length; to++) {
        const gap = to > from ? units[to].start - units[to - 1].end : 0;
        spoken += units[to].end - units[to].start;
        seconds += units[to].end - units[to].start + (gap > 0 && gap <= threshold ? gap : 0);
        words += units[to].words;
        visit({ from, to, seconds, miss: Math.abs(seconds - share), density: words / spoken });
        if (seconds > share * 1.3) break;
      }
    }
  };
  let closest = { from: 0, to: 0, seconds: 0, miss: Infinity, density: 0 };
  scan((w) => {
    if (w.miss < closest.miss) closest = w;
  });
  // "Near-equal" is a tenth of what is being asked for — or of what there
  // is, when the file cannot give that much. A near-equal run only wins by
  // being clearly more fluent (5% more words per second of speech).
  const slack = Math.min(share, closest.seconds) * 0.1;
  let best = closest;
  scan((w) => {
    if (w.miss <= closest.miss + slack && w.density > best.density * 1.05) best = w;
  });
  return best;
}
