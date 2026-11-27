/**
 * Track operations: add, remove, reorder, rename, mute / solo / lock and
 * volume. Video tracks always stay above audio tracks. Isomorphic and pure.
 * @module utils/edl/trackOps
 */

import { createTrack } from './factory.js';
import { mapTracks, tracksOfType, withTracks } from './immutable.js';
import { repairLinks } from './links.js';
import { clamp } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Track} Track */

/**
 * The next free "Video N" / "Audio N" name.
 * @param {Edl} edl
 * @param {'video'|'audio'} type
 * @returns {string}
 */
export function nextTrackName(edl, type) {
  const base = type === 'audio' ? 'Audio' : 'Video';
  const taken = new Set(edl.tracks.map((track) => track.name));
  let n = tracksOfType(edl, type).length + 1;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * Add an empty track. A new video track goes on top (in front of the other
 * video tracks) and a new audio track at the bottom, so the timeline grows
 * outwards from the video/audio divider like Vegas.
 * @param {Edl} edl
 * @param {'video'|'audio'} type
 * @param {{ name?: string, trackId?: string, position?: 'top'|'bottom' }} [opts]
 *   `position` within the tracks of that type; `trackId` to choose the id
 * @returns {Edl}
 */
export function addTrack(edl, type, opts = {}) {
  const kind = type === 'audio' ? 'audio' : 'video';
  const overrides = { name: opts.name || nextTrackName(edl, kind) };
  const taken = edl.tracks.some((track) => track.trackId === opts.trackId);
  if (opts.trackId && !taken) overrides.trackId = opts.trackId;
  /** @type {Track} */
  const track = createTrack(kind, overrides);
  const video = tracksOfType(edl, 'video');
  const audio = tracksOfType(edl, 'audio');
  const top = (opts.position || (kind === 'video' ? 'top' : 'bottom')) === 'top';
  if (kind === 'video')
    return { ...edl, tracks: [...(top ? [track, ...video] : [...video, track]), ...audio] };
  return { ...edl, tracks: [...video, ...(top ? [track, ...audio] : [...audio, track])] };
}

/**
 * Remove a track and its clips. Refused (document returned unchanged) for a
 * locked track and for the last track of its type.
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export function removeTrack(edl, trackId) {
  const track = edl.tracks.find((t) => t.trackId === trackId);
  if (!track || track.locked || tracksOfType(edl, track.type).length < 2) return edl;
  return repairLinks({ ...edl, tracks: edl.tracks.filter((t) => t !== track) });
}

/**
 * Reorder a track among the tracks of its type.
 * @param {Edl} edl
 * @param {string} trackId
 * @param {number} toIndex - Position within its type; 0 = top
 * @returns {Edl}
 */
export function moveTrack(edl, trackId, toIndex) {
  const track = edl.tracks.find((t) => t.trackId === trackId);
  if (!track || !Number.isFinite(toIndex)) return edl;
  const lane = tracksOfType(edl, track.type).filter((t) => t !== track);
  lane.splice(clamp(Math.round(toIndex), 0, lane.length), 0, track);
  const other = tracksOfType(edl, track.type === 'audio' ? 'video' : 'audio');
  return withTracks(edl, track.type === 'audio' ? [...other, ...lane] : [...lane, ...other]);
}

/**
 * Change track header fields: name, muted, solo, locked, volume (0..2).
 * Type, id and clips cannot be changed here.
 * @param {Edl} edl
 * @param {string} trackId
 * @param {{ name?: string, muted?: boolean, solo?: boolean, locked?: boolean, volume?: number }} patch
 * @returns {Edl}
 */
export function updateTrack(edl, trackId, patch) {
  return mapTracks(edl, (track) => {
    if (track.trackId !== trackId || !patch) return track;
    const next = { ...track };
    if (typeof patch.name === 'string') next.name = patch.name;
    for (const flag of ['muted', 'solo', 'locked']) {
      if (typeof patch[flag] === 'boolean') next[flag] = patch[flag];
    }
    if (Number.isFinite(patch.volume)) next.volume = clamp(patch.volume, 0, 2);
    return Object.keys(next).every((key) => next[key] === track[key]) ? track : next;
  });
}

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {'muted'|'solo'|'locked'} flag
 * @returns {Edl}
 */
function toggle(edl, trackId, flag) {
  const track = edl.tracks.find((t) => t.trackId === trackId);
  return track ? updateTrack(edl, trackId, { [flag]: !track[flag] }) : edl;
}

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {string} name
 * @returns {Edl}
 */
export const renameTrack = (edl, trackId, name) => updateTrack(edl, trackId, { name });

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {number} volume - Linear gain, clamped to 0..2
 * @returns {Edl}
 */
export const setTrackVolume = (edl, trackId, volume) => updateTrack(edl, trackId, { volume });

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackMute = (edl, trackId) => toggle(edl, trackId, 'muted');

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackSolo = (edl, trackId) => toggle(edl, trackId, 'solo');

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackLock = (edl, trackId) => toggle(edl, trackId, 'locked');
