/**
 * What the timeline marks on a music clip: its name, whether its rendering
 * is still on its way (or failed), where its bars and beats fall, and a
 * small picture of the song — every drum hit and every note with the time
 * it is played at. Times are in the song; a mark is drawn at
 * `timelineStart + (time − sourceIn)`, so it stays with the sound through
 * trims and splits. Pure and isomorphic.
 * @module utils/timeline/clipMarksMusic
 */

import { isMusicClip, isStaleMusic } from '#utils/music/clip.js';
import { songLabel } from '#utils/music/label.js';
import { beatSeconds, songFrame } from '#utils/music/timing.js';
import { unrollPart } from '#utils/music/unroll.js';
import { renderStatusOf } from '#utils/musicUi/renderState.js';

/** Bar lines closer than this, in pixels, are thinned out: every 2nd, 4th… is kept. */
export const BAR_MIN_PX = 6;
/** Beats are ticked when they are at least this far apart, in pixels. */
export const BEAT_MIN_PX = 9;
/** Events of one part that the picture shows at most. */
const MOST_EVENTS = 6000;

/**
 * @typedef {Object} SongPicture
 * @property {number[][]} hits - `[seconds, drum]` in time order; `drum` is
 *   the drum's place among the kit's thirteen
 * @property {number[][]} notes - `[seconds, length, pitch]` in time order
 * @property {number} low - Lowest pitch
 * @property {number} high - Highest pitch
 * @property {number} longest - Longest note, seconds
 */

/** @type {WeakMap<object, SongPicture>} Documents are never changed in place */
const pictures = new WeakMap();

/**
 * @param {any} clip - A music clip
 * @returns {string} The label somebody gave it, else the names of its song's parts
 */
export function musicLabel(clip) {
  return clip.label || songLabel(clip.music.song);
}

/**
 * @param {any} clip
 * @returns {''|'rendering'|'failed'|'stale'} What a music clip still lacks:
 *   its rendering is being made, could not be made, or is not being made
 *   (a locked track). '' for a clip that is fine and for any other clip
 */
export function musicMark(clip) {
  if (!isMusicClip(clip) || !isStaleMusic(clip)) return '';
  return renderStatusOf(clip.clipId)?.status || 'stale';
}

/**
 * The picture of a song: what its unmuted parts play, with swing.
 * @param {any} song - As a clip holds it (normalised)
 * @returns {SongPicture}
 */
export function songPicture(song) {
  const known = pictures.get(song);
  if (known) return known;
  const { bpm } = songFrame(song);
  /** @type {SongPicture} */
  const picture = { hits: [], notes: [], low: 127, high: 0, longest: 0 };
  for (const part of song.parts) {
    if (part.mute) continue;
    for (const [beat, what, , length] of unrollPart(song, part, MOST_EVENTS)) {
      const time = beatSeconds(song, beat);
      if (part.kind === 'drums') picture.hits.push([time, what]);
      else {
        const pitch = what + (part.transpose || 0);
        const seconds = (length * 60) / bpm;
        picture.notes.push([time, seconds, pitch]);
        picture.low = Math.min(picture.low, pitch);
        picture.high = Math.max(picture.high, pitch);
        picture.longest = Math.max(picture.longest, seconds);
      }
    }
  }
  picture.hits.sort((a, b) => a[0] - b[0]);
  picture.notes.sort((a, b) => a[0] - b[0]);
  pictures.set(song, picture);
  return picture;
}

/**
 * @param {number[][]} list - In order of their first number
 * @param {number} time
 * @returns {number} Index of the first entry at or after a time
 */
export function firstAt(list, time) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (list[mid][0] < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The bar and beat lines of a song between two of its times, thinned to
 * what can be told apart at a zoom.
 * @param {any} song
 * @param {number} from - Seconds into the song
 * @param {number} to
 * @param {number} pps - Pixels per second
 * @returns {{ time: number, bar: boolean }[]} In time order
 */
export function musicLines(song, from, to, pps) {
  const { bpm, beatsPerBar, bars } = songFrame(song);
  const beat = 60 / bpm;
  const bar = beat * beatsPerBar;
  let every = 1;
  while (bar * every * pps < BAR_MIN_PX) every *= 2;
  const beats = every === 1 && beat * pps >= BEAT_MIN_PX;
  const step = beats ? 1 : beatsPerBar * every;
  /** @type {{ time: number, bar: boolean }[]} */
  const lines = [];
  const first = Math.max(0, Math.ceil(from / beat / step - 1e-9) * step);
  for (let index = first; index <= bars * beatsPerBar && index * beat <= to; index += step) {
    lines.push({ time: index * beat, bar: index % beatsPerBar === 0 });
  }
  return lines;
}
