/**
 * Base edit: choosing the music bed.
 * @module api/director/baseEdit/music
 */

import { round3 } from '#utils/director/snap.js';

/** @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo */

/**
 * The music file to use: the project's own before the shared library's, one
 * with beat analysis before one without, then one long enough for the
 * edit, then the longest.
 * @param {MediaInfo[]} media
 * @param {number} target - Seconds the edit aims for
 * @returns {MediaInfo|null}
 */
export function chooseMusic(media, target) {
  const rank = (/** @type {MediaInfo} */ m) =>
    (m.global ? 0 : 8) + (m.beats.length ? 4 : 0) + ((m.duration ?? 0) >= target ? 2 : 0);
  const candidates = media.filter((m) => m.kind === 'music' && m.hasAudio);
  candidates.sort((a, b) => rank(b) - rank(a) || (b.duration ?? 0) - (a.duration ?? 0));
  return candidates[0] || null;
}

/**
 * Where in the track to start so that the first cut is on a beat: the
 * first beat, when it comes within the first five seconds.
 * @param {MediaInfo} music
 * @returns {number}
 */
export function musicStart(music) {
  const first = music.beats[0];
  return first !== undefined && first <= 5 ? round3(first) : 0;
}
