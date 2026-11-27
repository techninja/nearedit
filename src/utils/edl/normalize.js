/**
 * Document normalisation: accept anything loaded from disk or produced by
 * an LLM and return a valid EDL v2 document (one that passes `validateEdl`).
 * Isomorphic and pure.
 * @module utils/edl/normalize
 */

import { settleFades } from './fades.js';
import { EDL_VERSION, createTrack, newId } from './factory.js';
import { isTimed } from './immutable.js';
import { repairLinks } from './links.js';
import { normalizeClip } from './normalizeClip.js';
import { resolveAll } from './place.js';
import { snapToFrame, sortedTracks } from './query.js';
import { coerce, isObject, mergeShape, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {(id: any, prefix: string) => string} Unique */

/**
 * @param {any} raw
 * @param {number} fps
 * @param {Unique} unique
 * @returns {Track}
 */
function normalizeTrack(raw, fps, unique) {
  const type = raw.type === 'audio' ? 'audio' : 'video';
  const base = createTrack(type, { trackId: '', name: '' });
  /** @type {any} */
  const track = { ...mergeShape(base, { ...raw, type, clips: undefined }) };
  track.trackId = unique(raw.trackId ?? raw.id, type === 'audio' ? 'a' : 'v');
  const clips = (Array.isArray(raw.clips) ? raw.clips : [])
    .map((clip) => normalizeClip(clip, fps, type))
    .filter(Boolean)
    .map((clip) => ({ ...clip, clipId: unique(clip.clipId, 'clip') }));
  // Overlaps become cross-fades where they can; otherwise the later clip wins.
  track.clips = settleFades(resolveAll(clips, (clip) => isTimed(clip, track)));
  return track;
}

/**
 * @param {any} raw
 * @param {number} fps
 * @param {Unique} unique
 * @returns {import('./types.js').Marker[]}
 */
function normalizeMarkers(raw, fps, unique) {
  return (Array.isArray(raw) ? raw : [])
    .filter((marker) => isObject(marker) && Number.isFinite(toNumber(marker.time, NaN)))
    .map((marker) => ({
      markerId: unique(marker.markerId ?? marker.id, 'm'),
      time: Math.max(0, snapToFrame(toNumber(marker.time, 0), fps)),
      label: coerce('label', marker.label, ''),
      color: coerce('color', marker.color, ''),
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Give nameless tracks a "Video N" / "Audio N" name that is not taken.
 * @param {Track[]} tracks
 * @returns {Track[]}
 */
function nameTracks(tracks) {
  const taken = new Set(tracks.map((track) => track.name));
  return tracks.map((track) => {
    if (track.name) return track;
    const base = track.type === 'audio' ? 'Audio' : 'Video';
    let n = 1;
    while (taken.has(`${base} ${n}`)) n++;
    taken.add(`${base} ${n}`);
    return { ...track, name: `${base} ${n}` };
  });
}

/**
 * Normalise a document. What it guarantees:
 *
 * - v1 → v2 migration (no `version`, `id` instead of `trackId`/`clipId`,
 *   `fps`/`resolution` under `project`, a bare track array, missing `text`,
 *   `volume`, `groupId`, `locked`, `fit`, `kenBurns.enabled`…);
 * - every field present with a valid value, unknown fields dropped;
 * - clips on the frame grid, sorted, with unusable ones dropped;
 * - invariants 1–5: overlaps repaired into cross-fades or overwrites,
 *   fades clamped, asymmetric and dangling links repaired;
 * - unique track, clip and marker ids (the first holder keeps a duplicate);
 * - at least one video and one audio track, video tracks first.
 *
 * A valid v2 document comes back deep-equal to itself.
 * @param {any} raw
 * @returns {Edl}
 */
export function normalizeEdl(raw) {
  const doc = Array.isArray(raw) ? { tracks: raw } : isObject(raw) ? raw : {};
  const head = isObject(doc.project) ? { ...doc.project, ...doc } : doc;
  const rate = toNumber(head.fps, 30);
  const fps = rate >= 1 && rate <= 240 ? rate : 30;
  const sized = typeof head.resolution === 'string' && /^[1-9]\d*x[1-9]\d*$/.test(head.resolution);
  const seen = new Set();
  /** @type {Unique} */
  const unique = (id, prefix) => {
    const kept = typeof id === 'string' && id && !seen.has(id) ? id : newId(prefix);
    seen.add(kept);
    return kept;
  };
  const tracks = (Array.isArray(doc.tracks) ? doc.tracks : [])
    .filter(isObject)
    .map((track) => normalizeTrack(track, fps, unique));
  for (const type of /** @type {('video'|'audio')[]} */ (['video', 'audio'])) {
    if (tracks.some((track) => track.type === type)) continue;
    const trackId = unique(type === 'audio' ? 'a1' : 'v1', type === 'audio' ? 'a' : 'v');
    tracks.push(createTrack(type, { trackId, name: '' }));
  }
  return repairLinks({
    version: EDL_VERSION,
    fps,
    resolution: sized ? head.resolution : '1920x1080',
    tracks: nameTracks(/** @type {Track[]} */ (sortedTracks(tracks))),
    markers: normalizeMarkers(doc.markers, fps, unique),
  });
}
