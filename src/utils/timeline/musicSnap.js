/**
 * The bars and beats of music clips as snap points, like the beats of
 * analysed music files (`beats.js`): cuts and clips can be put on the bar
 * by hand. A clip's lines are those of its song, moved to where the clip
 * shows them. They are only offered while they are far enough apart on
 * screen to aim at: beats first give way to bars, then bars to nothing.
 * Pure given the document.
 * @module utils/timeline/musicSnap
 */

import { isMusicClip } from '#utils/music/clip.js';
import { barTimes, beatTimes } from '#utils/music/timing.js';
import { MIN_BEAT_PX } from './beats.js';

/** @type {WeakMap<object, { bars: number[], beats: number[] }>} By song: documents are immutable */
const lines = new WeakMap();

/**
 * @param {any} song
 * @returns {{ bars: number[], beats: number[] }} Seconds of its bar lines and of its beats
 */
function linesOf(song) {
  if (!lines.has(song)) lines.set(song, { bars: barTimes(song), beats: beatTimes(song) });
  return lines.get(song);
}

/**
 * Timeline times of the bars (and, zoomed in, the beats) of the music
 * clips of a document, on tracks that are not muted.
 * @param {any} doc - EDL document
 * @param {number} pps - Pixels per second at the current zoom
 * @param {{ exclude?: Iterable<string> }} [opts] - `exclude`: clip ids being
 *   dragged (a clip never snaps to its own bars)
 * @returns {number[]}
 */
export function musicSnapTimes(doc, pps, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  /** @type {number[]} */
  const times = [];
  for (const track of doc.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (!isMusicClip(clip) || exclude.has(clip.clipId)) continue;
      const { bars, beats } = linesOf(clip.music.song);
      const wide = (/** @type {number[]} */ list) => (list[1] - list[0]) * pps >= MIN_BEAT_PX;
      const offered = wide(beats) ? beats : wide(bars) ? bars : [];
      for (const time of offered) {
        if (time < clip.sourceIn - 1e-6) continue;
        if (time > clip.sourceOut + 1e-6) break;
        times.push(clip.timelineStart + (time - clip.sourceIn));
      }
    }
  }
  return times;
}
