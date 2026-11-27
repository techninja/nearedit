/**
 * Document normalisation: accept anything loaded from disk or produced by
 * an LLM and return a valid EDL v3 document (one that passes `validateEdl`).
 * Isomorphic and pure.
 * @module utils/edl/normalize
 */

import { settleFades } from './fades.js';
import { BACKGROUND_COLOR, EDL_VERSION, createTrack, newId } from './factory.js';
import { repairLinks } from './links.js';
import { normalizeClip } from './normalizeClip.js';
import { normalizeMarkers, normalizeRegions } from './normalizeMarks.js';
import { resolveAll } from './place.js';
import { sortedTracks } from './query.js';
import { isObject, mergeShape, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./normalizeMarks.js').Unique} Unique */

/**
 * @param {any} raw
 * @param {number} fps
 * @param {Unique} unique
 * @param {boolean} legacy - The document is older than v3
 * @returns {Track}
 */
function normalizeTrack(raw, fps, unique, legacy) {
  const type = raw.type === 'audio' ? 'audio' : 'video';
  const base = createTrack(type, { trackId: '', name: '' });
  /** @type {any} */
  const track = { ...mergeShape(base, { ...raw, type, clips: undefined }) };
  track.trackId = unique(raw.trackId ?? raw.id, type === 'audio' ? 'a' : 'v');
  const clips = (Array.isArray(raw.clips) ? raw.clips : [])
    .map((clip) => normalizeClip(clip, fps, type, { legacy }))
    .filter(Boolean)
    .map((clip) => ({ ...clip, clipId: unique(clip.clipId, 'clip') }));
  // Overlaps become cross-fades where they can; otherwise the later clip wins.
  track.clips = settleFades(resolveAll(clips));
  return track;
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
 * - v1 → v3 migration (no `version`, `id` instead of `trackId`/`clipId`,
 *   `fps`/`resolution` under `project`, a bare track array, missing `text`,
 *   `volume`, `groupId`, `locked`, `fit`, `kenBurns.enabled`…);
 * - v2 → v3 migration: a document whose `version` is not 3 or more gets the
 *   v3 defaults, and its generator, title, image and placeholder clips —
 *   which had no source window — get `sourceIn: 0`, `sourceOut: duration`.
 *   Nothing moves: the same clips at the same times;
 * - every field present with a valid value, unknown fields dropped. The
 *   free-form fields survive as bounded JSON-safe data: `generator.params`,
 *   effect `params`, and `keyframes` (sorted, unusable keys and paths that
 *   address nothing dropped); effect ids are unique within their stack;
 * - clips on the frame grid, sorted, with unusable ones dropped;
 * - invariants 1–5: overlaps repaired into cross-fades or overwrites,
 *   fades clamped, asymmetric and dangling links repaired;
 * - unique track, clip, marker and region ids (the first holder keeps a
 *   duplicate); markers and regions on the frame grid, sorted;
 * - at least one video and one audio track, video tracks first.
 *
 * A valid v3 document comes back deep-equal to itself.
 * @param {any} raw
 * @returns {Edl}
 */
export function normalizeEdl(raw) {
  const doc = Array.isArray(raw) ? { tracks: raw } : isObject(raw) ? raw : {};
  const head = isObject(doc.project) ? { ...doc.project, ...doc } : doc;
  const rate = toNumber(head.fps, 30);
  const fps = rate >= 1 && rate <= 240 ? rate : 30;
  const sized = typeof head.resolution === 'string' && /^[1-9]\d*x[1-9]\d*$/.test(head.resolution);
  const legacy = !(toNumber(head.version, 0) >= EDL_VERSION);
  const colored = typeof head.background === 'string' && BACKGROUND_COLOR.test(head.background);
  const seen = new Set();
  /** @type {Unique} */
  const unique = (id, prefix) => {
    const kept = typeof id === 'string' && id && !seen.has(id) ? id : newId(prefix);
    seen.add(kept);
    return kept;
  };
  const tracks = (Array.isArray(doc.tracks) ? doc.tracks : [])
    .filter(isObject)
    .map((track) => normalizeTrack(track, fps, unique, legacy));
  for (const type of /** @type {('video'|'audio')[]} */ (['video', 'audio'])) {
    if (tracks.some((track) => track.type === type)) continue;
    const trackId = unique(type === 'audio' ? 'a1' : 'v1', type === 'audio' ? 'a' : 'v');
    tracks.push(createTrack(type, { trackId, name: '' }));
  }
  return repairLinks({
    version: EDL_VERSION,
    fps,
    resolution: sized ? head.resolution : '1920x1080',
    background: colored ? head.background : '#000000',
    tracks: nameTracks(/** @type {Track[]} */ (sortedTracks(tracks))),
    markers: normalizeMarkers(doc.markers, fps, unique),
    regions: normalizeRegions(doc.regions, fps, unique),
  });
}
