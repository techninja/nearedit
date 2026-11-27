/**
 * Working on the posted timeline. In-place actions copy the document's
 * tracks into fragment form, rewrite the copy, and return it as a
 * whole-timeline `replace` — the one DirectorResult mode whose meaning
 * does not depend on how overlapping material is merged.
 * @module api/director/inplace/doc
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { mediaType } from '../../lib/mediaScan.js';
import { isAllowedPath } from '../../lib/paths.js';
import { readSidecar } from '../../lib/sidecar.js';
import { toMediaInfo } from '../context/mediaInfo.js';
import { directorResult, typedTracks } from '../result.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {{ type: 'video'|'audio', index: number, name: string, clips: any[], trackId?: string,
 *   muted?: boolean, solo?: boolean, locked?: boolean, volume?: number }} DocTrack
 */

/**
 * The document's tracks as fragment tracks, clips deep-copied. Each entry
 * also carries the track's own settings so a replace need not lose them.
 * @param {any} edl
 * @returns {DocTrack[]}
 */
export function docTracks(edl) {
  return typedTracks(edl).map(({ track, type, index }) => ({
    type,
    index,
    name: track.name || (type === 'audio' ? `Audio ${index + 1}` : `Video ${index + 1}`),
    clips: structuredClone(track.clips || []),
    trackId: track.trackId,
    muted: Boolean(track.muted),
    solo: Boolean(track.solo),
    locked: Boolean(track.locked),
    volume: track.volume ?? 1,
  }));
}

/**
 * Insert a new, empty track; tracks of that type at or after `index` move
 * one place back.
 * @param {DocTrack[]} tracks
 * @param {'video'|'audio'} type
 * @param {number} index
 * @param {string} name
 * @returns {DocTrack} The new track (already added to `tracks`)
 */
export function insertTrack(tracks, type, index, name) {
  for (const track of tracks) if (track.type === type && track.index >= index) track.index++;
  /** @type {DocTrack} */
  const track = { type, index, name, clips: [] };
  tracks.push(track);
  tracks.sort((a, b) => (a.type === b.type ? a.index - b.index : a.type === 'video' ? -1 : 1));
  return track;
}

/**
 * Whether nothing on a track overlaps a stretch of time.
 * @param {DocTrack} track
 * @param {number} start - Seconds
 * @param {number} end
 * @returns {boolean}
 */
export function isFree(track, start, end) {
  return track.clips.every((c) => c.timelineEnd <= start + 1e-6 || c.timelineStart >= end - 1e-6);
}

/**
 * A lookup from source path to MediaInfo: the project's media first, then
 * any other allowed file through its sidecar (a clip may point at a file
 * outside this project's folders).
 * @param {MediaInfo[]} media
 * @returns {(filePath: string) => MediaInfo|null}
 */
export function mediaLookup(media) {
  /** @type {Map<string, MediaInfo|null>} */
  const cache = new Map(media.map((m) => [m.filePath, m]));
  return (filePath) => {
    if (!filePath) return null;
    if (cache.has(filePath)) return cache.get(filePath);
    let info = null;
    const type = mediaType(filePath);
    if (type && type !== 'text' && isAllowedPath(filePath) && existsSync(filePath)) {
      const entry = {
        filename: basename(filePath),
        filePath,
        relativePath: basename(filePath),
        root: '',
        global: false,
        type,
      };
      info = toMediaInfo(entry, readSidecar(filePath));
    }
    cache.set(filePath, info);
    return info;
  };
}

/**
 * Wrap rewritten document tracks as a whole-timeline replace. A replace
 * clears the timeline's markers and never touches locked tracks, so the
 * document's markers are passed through and locked tracks travel empty.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @param {DocTrack[]} tracks
 * @param {string} summary
 * @param {string[]} notes
 * @param {any[]} [markers] - Defaults to the document's own markers
 * @returns {import('../result.js').DirectorResult}
 */
export function inPlaceResult(ctx, tracks, summary, notes, markers = ctx.edl?.markers) {
  for (const track of tracks) track.clips.sort((a, b) => a.timelineStart - b.timelineStart);
  const sent = tracks.map((track) => (track.locked ? { ...track, clips: [] } : track));
  const kept = (Array.isArray(markers) ? markers : []).filter((m) => Number.isFinite(m?.time));
  const directive = { ...ctx.directive, mode: 'replace' };
  return directorResult(
    { tracks: sent, markers: kept, summary, notes },
    directive,
    null,
    ctx.format.fps,
  );
}
