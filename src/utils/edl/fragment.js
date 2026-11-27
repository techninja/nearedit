/**
 * Preparing a DirectorResult fragment (API.md) for merging: sanitise its
 * clips, make sure their ids cannot collide with the document, and keep the
 * links and groups that live inside the fragment. An id that is free in the
 * document is kept, so clips rewritten in place (silence removal, beat sync)
 * stay selected; only clashing or repeated ids are replaced.
 * Isomorphic and pure.
 * @module utils/edl/fragment
 */

import { newId } from './factory.js';
import { repairLinks } from './links.js';
import { normalizeClip } from './normalizeClip.js';
import { snapToFrame } from './query.js';
import { isObject, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Marker} Marker */

/**
 * @typedef {Object} FragmentTrack
 * @property {'video'|'audio'} type
 * @property {number} row - Nth track of that type in the document
 * @property {string} name - Used when the track has to be created
 * @property {Clip[]} clips - Times relative to the fragment start
 */

/**
 * @typedef {Object} Fragment
 * @property {FragmentTrack[]} tracks
 * @property {Marker[]} markers - Times relative to the fragment start
 * @property {number} duration - End of the last clip
 */

/**
 * @param {any} result - A DirectorResult
 * @param {number} fps - Frame rate of the document it will be merged into
 * @param {{ clipIds: Set<string>, groupIds: Set<string> }} [taken] - Ids used
 *   by clips that will remain in the document. When given, fragment ids that
 *   are free are kept; without it every clip gets a fresh id (paste, duplicate).
 * @returns {Fragment}
 */
export function prepareFragment(result, fps, taken) {
  const keepClip = (id) => Boolean(taken) && !taken.clipIds.has(id);
  const keepGroup = (id) => Boolean(taken) && !taken.groupIds.has(id);
  const rawTracks = Array.isArray(result?.tracks) ? result.tracks.filter(isObject) : [];
  const counts = { video: 0, audio: 0 };
  /** @type {Map<string, string>} */
  const ids = new Map();
  /** @type {Map<string, string>} */
  const groups = new Map();
  const tracks = rawTracks.map((raw) => {
    /** @type {'video'|'audio'} */
    const type = raw.type === 'audio' ? 'audio' : 'video';
    const index = toNumber(raw.index, counts[type]);
    counts[type]++;
    const clips = (Array.isArray(raw.clips) ? raw.clips : [])
      .map((clip) => normalizeClip(clip, fps, type))
      .filter(Boolean);
    for (const clip of clips) {
      const { clipId, groupId } = clip;
      if (clipId && !ids.has(clipId)) ids.set(clipId, keepClip(clipId) ? clipId : newId('clip'));
      if (groupId && !groups.has(groupId)) {
        groups.set(groupId, keepGroup(groupId) ? groupId : newId('grp'));
      }
    }
    const name = typeof raw.name === 'string' ? raw.name : '';
    return { type, row: Math.max(0, Math.floor(index)), name, clips };
  });

  // An id that occurs twice keeps its mapping for the first holder only;
  // links resolve through the same map, so pairs stay pairs.
  const used = new Set();
  const reidentify = (clip) => {
    const mapped = ids.get(clip.clipId);
    const clipId = mapped && !used.has(mapped) ? mapped : newId('clip');
    used.add(clipId);
    const linkedClipId = ids.get(clip.linkedClipId) || '';
    return { ...clip, clipId, linkedClipId, groupId: groups.get(clip.groupId) || '' };
  };
  const renamed = tracks.map((track, i) => ({
    ...track,
    trackId: String(i),
    locked: false,
    clips: track.clips.map(reidentify),
  }));
  /** @type {any} */
  const linked = repairLinks(/** @type {any} */ ({ tracks: renamed }));

  const markers = (Array.isArray(result?.markers) ? result.markers : [])
    .filter((marker) => isObject(marker) && Number.isFinite(toNumber(marker.time, NaN)))
    .map((marker) => ({
      markerId: newId('m'),
      time: Math.max(0, snapToFrame(toNumber(marker.time, 0), fps)),
      label: typeof marker.label === 'string' ? marker.label : '',
      color: typeof marker.color === 'string' ? marker.color : '',
    }));
  const ends = linked.tracks.flatMap((track) => track.clips.map((clip) => clip.timelineEnd));
  return { tracks: linked.tracks, markers, duration: Math.max(0, ...ends) };
}
