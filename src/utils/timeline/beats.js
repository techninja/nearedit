/**
 * Beats as snap points. When a music clip on the timeline has detected
 * beats (the `beats` analysis step), its beat times become snap candidates,
 * so cuts and clips can be dropped on the beat by hand.
 *
 * Beats are only offered while they are far enough apart on screen to aim
 * at; zoomed out, a beat every few pixels would make everything stick.
 * @module utils/timeline/beats
 */

import { getMediaItem } from '#utils/media/library.js';
import { loadSidecar, onSidecarChange } from '#utils/media/sidecars.js';

/** Beats closer together than this many pixels are not snap targets. */
export const MIN_BEAT_PX = 24;

/** @type {Map<string, number[]>} Beat times per source file, once fetched */
const known = new Map();
/** @type {Set<string>} Files whose sidecar is being fetched */
const fetching = new Set();

onSidecarChange((path) => {
  if (path) known.delete(path);
  else known.clear();
});

/**
 * Beat times of a source file, if they are already known. The first call
 * for a file starts loading them, so a later drag has them.
 * @param {string} path
 * @returns {number[]} Seconds into the source; empty until loaded
 */
function beatsOf(path) {
  const beats = known.get(path);
  if (beats) return beats;
  if (!fetching.has(path) && getMediaItem(path)?.analysis?.beats) {
    fetching.add(path);
    loadSidecar(path)
      .then((sidecar) => known.set(path, Array.isArray(sidecar?.beats) ? sidecar.beats : []))
      .catch(() => {}) // not fatal: the file simply offers no beats this time
      .finally(() => fetching.delete(path));
  }
  return [];
}

/**
 * Timeline times of the beats under the audible audio clips of a document.
 * Pure given the beats: `lookup` is injectable for tests.
 * @param {any} doc - EDL document
 * @param {number} pps - Pixels per second at the current zoom
 * @param {{ exclude?: Iterable<string>, lookup?: (path: string) => number[] }} [opts] -
 *   `exclude`: clip ids being dragged (a clip never snaps to its own beats)
 * @returns {number[]}
 */
export function beatSnapTimes(doc, pps, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const lookup = opts.lookup || beatsOf;
  const times = [];
  for (const track of doc.tracks) {
    if (track.type !== 'audio' || track.muted) continue;
    for (const clip of track.clips) {
      if (!clip.sourceFile || exclude.has(clip.clipId)) continue;
      const beats = lookup(clip.sourceFile);
      if (beats.length < 2) continue;
      const spacing = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
      if (spacing * pps < MIN_BEAT_PX) continue;
      for (const beat of beats) {
        if (beat < clip.sourceIn) continue;
        if (beat > clip.sourceOut) break;
        times.push(clip.timelineStart + (beat - clip.sourceIn));
      }
    }
  }
  return times;
}
