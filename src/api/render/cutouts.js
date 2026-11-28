/**
 * The person cutouts of a render. A clip with cutout on is drawn through
 * its matte when the cutout file it remembers is there and covers what the
 * clip plays at the document's frame rate; any other such clip renders its
 * plain picture, and the job says so. A render makes no cutouts itself —
 * that takes minutes, not milliseconds (CUTOUT.md § Server).
 * Reference: docs/app-spec/RENDER.md § Person cutout.
 * @module api/render/cutouts
 */

import { cutoutOf, cutoutState, hasCutout } from '#utils/cutout/index.js';
import { renderableClips } from './scope.js';

/**
 * A clip without what was made for its cutout: its settings stay.
 * @param {any} clip
 * @returns {any}
 */
function unmade(clip) {
  const settings = { ...clip.cutout };
  delete settings.made;
  return { ...clip, cutout: settings };
}

/**
 * Keep the cutouts a render can use and take the rest off their clips, on
 * every track: afterwards a clip that still remembers a cutout is drawn
 * through it, and one with cutout on that remembers none renders plain.
 * @param {{ fps?: number, tracks: any[] }} edl - A checked document
 * @param {(file: string) => boolean} exists - Whether a cutout file is there
 * @returns {any} The same document when every cutout is usable
 */
export function settleCutouts(edl, exists) {
  const usable = (/** @type {any} */ clip) =>
    cutoutState(clip, edl.fps) === 'ready' && exists(clip.cutout.made.file);
  const tracks = edl.tracks.map((track) => {
    const clips = (track.clips || []).map((clip) =>
      clip?.cutout?.made && !usable(clip) ? unmade(clip) : clip,
    );
    return clips.some((clip, i) => clip !== track.clips[i]) ? { ...track, clips } : track;
  });
  return tracks.some((track, i) => track !== edl.tracks[i]) ? { ...edl, tracks } : edl;
}

/**
 * The cutout files a render reads: those of the clips that are seen.
 * @param {{ tracks?: any[] }} edl - After `settleCutouts`
 * @returns {string[]} Unique paths
 */
export function cutoutFiles(edl) {
  const files = renderableClips(edl).map(({ clip }) => cutoutOf(clip)?.file);
  return [...new Set(files.filter(Boolean))];
}

/**
 * What a render cannot honour: a clip that is seen, has cutout on and no
 * usable cutout.
 * @param {{ tracks?: any[] }} edl - After `settleCutouts`
 * @returns {string[]} One warning per media file
 */
export function cutoutWarnings(edl) {
  const waiting = renderableClips(edl)
    .filter(({ clip, kind }) => kind === 'video' && hasCutout(clip) && !cutoutOf(clip))
    .map(({ clip }) => clip.sourceFile);
  return [...new Set(waiting)].map(
    (file) =>
      `Cut out person is on for ${file}, but its cutout is not made or is out of date: ` +
      'it is rendered with its background (make the cutout first)',
  );
}
