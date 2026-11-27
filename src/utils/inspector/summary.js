/**
 * What the inspector shows when nothing is selected: the document at a
 * glance. Pure and isomorphic.
 * @module utils/inspector/summary
 */

import { clipKind } from '#utils/edl/factory.js';
import { timelineDuration } from '#utils/edl/query.js';

/**
 * @typedef {Object} DocumentSummary
 * @property {string} resolution - e.g. `1920×1080`
 * @property {number} fps
 * @property {number} duration - Seconds
 * @property {number} videoTracks
 * @property {number} audioTracks
 * @property {number} clips
 * @property {Record<string, number>} kinds - Clip count per kind
 * @property {number} markers
 * @property {{ trackId: string, name: string, type: string, clips: number,
 *   muted: boolean, solo: boolean, locked: boolean }[]} tracks
 */

/**
 * @param {import('#utils/edl/types.js').Edl} edl
 * @returns {DocumentSummary}
 */
export function documentSummary(edl) {
  const tracks = edl?.tracks || [];
  /** @type {Record<string, number>} */
  const kinds = { video: 0, audio: 0, image: 0, title: 0, generator: 0, placeholder: 0 };
  let clips = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      kinds[clipKind(clip, track)]++;
      clips++;
    }
  }
  return {
    resolution: String(edl?.resolution || '').replace('x', '×'),
    fps: edl?.fps || 0,
    duration: timelineDuration(tracks),
    videoTracks: tracks.filter((t) => t.type === 'video').length,
    audioTracks: tracks.filter((t) => t.type === 'audio').length,
    clips,
    kinds,
    markers: (edl?.markers || []).length,
    tracks: tracks.map((t) => ({
      trackId: t.trackId,
      name: t.name || t.trackId,
      type: t.type,
      clips: t.clips.length,
      muted: !!t.muted,
      solo: !!t.solo,
      locked: !!t.locked,
    })),
  };
}
