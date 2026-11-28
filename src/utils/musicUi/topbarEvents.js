/**
 * Behaviour of the music editor's top bar (`<music-topbar>`): play and
 * stop, and the bars the audition repeats.
 * @module utils/musicUi/topbarEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';

/**
 * @typedef {Object} MusicTopbarHost
 * @property {any} song
 * @property {number[]} loop - `[from, to)` in bars: what the audition repeats
 * @property {import('./audition.js').AuditionState} audition
 * @property {boolean} locked
 */

/** @typedef {MusicTopbarHost & HTMLElement} Host */

/** Play or stop. @param {Host} host */
export function handlePlay(host) {
  dispatch(host, 'music-transport', { detail: { action: 'toggle' }, bubbles: true });
}

/**
 * One end of the loop was typed: bars are counted from one, the range
 * keeps at least one bar inside the song.
 * @param {Host} host
 * @param {Event} event
 */
export function handleLoop(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const typed = Math.round(Number(input.value));
  if (input.value.trim() === '' || !Number.isFinite(typed)) return;
  const { bars } = host.song;
  let [from, to] = host.loop;
  if (input.dataset.end === 'from') {
    from = Math.max(0, Math.min(bars - 1, typed - 1));
    to = Math.max(to, from + 1);
  } else {
    to = Math.max(1, Math.min(bars, typed));
    from = Math.min(from, to - 1);
  }
  emitChange(host, 'loop', [from, to]);
}

/** "All": the audition repeats the whole song again. @param {Host} host */
export const handleWhole = (host) => emitChange(host, 'loop', [0, 0]);
