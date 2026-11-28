/**
 * Where a part plays, as a strip of the song's bars that can be painted:
 * each bar is on or off. A part that plays everywhere stores no ranges; a
 * part always plays somewhere (silence is what Mute is for). Pure.
 * @module utils/musicUi/playStrip
 */

import { playRanges } from '#utils/music/timing.js';
import { changePart } from './songEdit.js';

/** @typedef {import('#utils/music/types.js').Song} Song */

/**
 * @param {Song} song
 * @param {any} part
 * @returns {boolean[]} For every bar of the song: whether the part sounds in it
 */
export function playBars(song, part) {
  const bars = Array.from({ length: song.bars }, () => false);
  for (const [from, to] of playRanges(song, part)) {
    for (let bar = from; bar < to; bar++) bars[bar] = true;
  }
  return bars;
}

/**
 * @param {boolean[]} bars
 * @returns {number[][]} The runs of bars that are on, as `[from, to)` ranges;
 *   empty when every bar is on (which is how "everywhere" is stored)
 */
export function rangesOf(bars) {
  if (bars.every(Boolean)) return [];
  /** @type {number[][]} */
  const ranges = [];
  bars.forEach((on, bar) => {
    const last = ranges[ranges.length - 1];
    if (!on) return;
    if (last && last[1] === bar) last[1] = bar + 1;
    else ranges.push([bar, bar + 1]);
  });
  return ranges;
}

/**
 * Switch bars of a part on or off.
 * @param {Song} song
 * @param {string} partId
 * @param {number[]} bars - Bars of the song
 * @param {boolean} on
 * @returns {Song} The same song when nothing changes, and when it would
 *   leave the part nowhere to play
 */
export function paintPlay(song, partId, bars, on) {
  return changePart(song, partId, (part) => {
    const now = playBars(song, part);
    const next = [...now];
    for (const bar of bars) if (bar >= 0 && bar < next.length) next[bar] = on;
    if (!next.some(Boolean) || next.every((value, bar) => value === now[bar])) return part;
    return { ...part, play: rangesOf(next) };
  });
}
