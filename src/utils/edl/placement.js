/**
 * Putting new clips on the timeline: choosing (or creating) target tracks
 * and adding clips under the overlap rules. Shared by paste, media/title
 * insertion and the director. Isomorphic and pure.
 * @module utils/edl/placement
 */

import { settle } from './crossfade.js';
import { mapTracks, tracksOfType, withClips } from './immutable.js';
import { repairLinks } from './links.js';
import { addTrack } from './trackOps.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {{ edl: Edl, track: Track }} Picked */

/** Highest track row a fragment or clipboard may ask for (guards bad input). */
const MAX_ROW = 63;

/**
 * Add clips to tracks. The new clips are "incoming": a partial overlap with
 * what is already there becomes a cross-fade, anything else is overwritten.
 * Clips aimed at a locked or missing track are not added.
 * @param {Edl} edl
 * @param {{ trackId: string, clip: Clip }[]} items
 * @param {import('./types.js').OverlapOptions} [opts]
 * @returns {Edl}
 */
export function addClips(edl, items, opts = {}) {
  /** @type {Map<string, Clip[]>} */
  const arrivals = new Map();
  for (const { trackId, clip } of items) {
    arrivals.set(trackId, [...(arrivals.get(trackId) || []), clip]);
  }
  let added = 0;
  const raw = mapTracks(edl, (track) => {
    const clips = arrivals.get(track.trackId);
    if (!clips || track.locked) return track;
    added += clips.length;
    return withClips(track, [...track.clips, ...clips]);
  });
  const incoming = items.map((item) => item.clip.clipId);
  return settle(edl, added < items.length ? repairLinks(raw) : raw, { ...opts, incoming });
}

/**
 * The Nth track of a type, creating tracks at the bottom of that type
 * until it exists.
 * @param {Edl} edl
 * @param {'video'|'audio'} type
 * @param {number} row - 0 = first track of that type
 * @param {string} [name] - Name for a track that has to be created
 * @returns {Picked}
 */
export function ensureTrack(edl, type, row, name) {
  const wanted = Math.min(Math.max(0, Math.floor(row) || 0), MAX_ROW);
  let doc = edl;
  while (tracksOfType(doc, type).length <= wanted) {
    const missing = wanted - tracksOfType(doc, type).length;
    doc = addTrack(doc, type, { position: 'bottom', name: missing ? undefined : name });
  }
  return { edl: doc, track: tracksOfType(doc, type)[wanted] };
}

/**
 * Choose where new material of a type goes: the requested track when it has
 * the right type and is unlocked, otherwise the first unlocked track in
 * `order`, otherwise a new track.
 * @param {Edl} edl
 * @param {'video'|'audio'} type
 * @param {string} [trackId] - Requested track
 * @param {Track[]} [order] - Fallback candidates, best first
 * @returns {Picked}
 */
export function pickTrack(edl, type, trackId, order = tracksOfType(edl, type)) {
  const lane = tracksOfType(edl, type);
  const asked = lane.find((track) => track.trackId === trackId && !track.locked);
  const track = asked || order.find((candidate) => !candidate.locked);
  if (track) return { edl, track };
  const doc = addTrack(edl, type);
  const created = tracksOfType(doc, type);
  return { edl: doc, track: type === 'video' ? created[0] : created[created.length - 1] };
}

/**
 * The audio track that belongs to a video track: the one at the same
 * distance from the video/audio divider (bottom video ↔ top audio), then
 * the nearest ones below it.
 * @param {Edl} edl
 * @param {Track} videoTrack
 * @returns {Track[]} Audio tracks, best match first
 */
export function pairedAudioTracks(edl, videoTrack) {
  const video = tracksOfType(edl, 'video');
  const audio = tracksOfType(edl, 'audio');
  const row = Math.min(video.length - 1 - video.indexOf(videoTrack), audio.length - 1);
  return [...audio.slice(Math.max(0, row)), ...audio.slice(0, Math.max(0, row)).reverse()];
}
