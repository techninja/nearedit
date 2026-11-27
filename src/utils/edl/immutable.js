/**
 * Immutable update helpers with structural sharing: anything an operation
 * does not touch keeps its identity, so the UI can diff by reference.
 * Isomorphic and pure.
 * @module utils/edl/immutable
 */

import { clipKind } from './factory.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * Order of every clip list: by start, ties by end.
 * @param {Clip} a
 * @param {Clip} b
 * @returns {number}
 */
export function compareClips(a, b) {
  return a.timelineStart - b.timelineStart || a.timelineEnd - b.timelineEnd;
}

/**
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean} True when both arrays hold the same references in order
 */
export function sameItems(a, b) {
  return a === b || (a.length === b.length && a.every((item, i) => item === b[i]));
}

/**
 * @param {Clip[]} clips
 * @returns {Clip[]} The same array when it is already in order
 */
export function sortClips(clips) {
  for (let i = 1; i < clips.length; i++) {
    if (compareClips(clips[i - 1], clips[i]) > 0) return [...clips].sort(compareClips);
  }
  return clips;
}

/**
 * @param {Track} track
 * @param {Clip[]} clips
 * @returns {Track} The same track when the clips did not change
 */
export function withClips(track, clips) {
  const sorted = sortClips(clips);
  return sameItems(track.clips, sorted) ? track : { ...track, clips: sorted };
}

/**
 * @param {Edl} edl
 * @param {Track[]} tracks
 * @returns {Edl} The same document when no track changed
 */
export function withTracks(edl, tracks) {
  return sameItems(edl.tracks, tracks) ? edl : { ...edl, tracks };
}

/**
 * @param {Edl} edl
 * @param {(track: Track, index: number) => Track} fn
 * @returns {Edl}
 */
export function mapTracks(edl, fn) {
  return withTracks(edl, edl.tracks.map(fn));
}

/**
 * Rewrite clips. `fn` returns the clip unchanged, a replacement, an array of
 * replacements, or null to remove it. Locked tracks are skipped.
 * @param {Edl} edl
 * @param {(clip: Clip, track: Track) => Clip | Clip[] | null} fn
 * @param {boolean} [includeLocked=false]
 * @returns {Edl}
 */
export function mapClips(edl, fn, includeLocked = false) {
  return mapTracks(edl, (track) => {
    if (track.locked && !includeLocked) return track;
    const clips = track.clips.flatMap((clip) => fn(clip, track) ?? []);
    return withClips(track, clips);
  });
}

/**
 * Accept one id or any collection of ids.
 * @param {Iterable<string>|string|null|undefined} ids
 * @returns {string[]}
 */
export function idList(ids) {
  if (typeof ids === 'string') return [ids];
  return ids ? [...ids] : [];
}

/**
 * @param {Edl} edl
 * @returns {Map<string, ClipRef>} Every clip with its track, by clipId
 */
export function indexClips(edl) {
  /** @type {Map<string, ClipRef>} */
  const index = new Map();
  for (const track of edl.tracks) {
    for (const clip of track.clips) index.set(clip.clipId, { clip, track });
  }
  return index;
}

/**
 * Rewrite one clip by id. Clips on locked tracks and unknown ids are left
 * alone.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {(clip: Clip, track: Track) => Clip} change - Returns the clip
 *   itself to change nothing
 * @returns {Edl} The same document when nothing changed
 */
export function changeClip(edl, clipId, change) {
  const ref = indexClips(edl).get(clipId);
  if (!ref || ref.track.locked) return edl;
  const next = change(ref.clip, ref.track);
  return next === ref.clip ? edl : mapClips(edl, (clip) => (clip === ref.clip ? next : clip));
}

/**
 * Whether a clip plays real media. Video and audio clips have a bounded
 * source: `sourceIn` cannot go below 0 or `sourceOut` past the file's end.
 * Generators, titles, images and placeholders keep a source window too
 * (invariant 1) but theirs is unbounded.
 * @param {Clip} clip
 * @param {Track} [track]
 * @returns {boolean}
 */
export function isTimed(clip, track) {
  const kind = clipKind(clip, track);
  return kind === 'video' || kind === 'audio';
}

/**
 * @param {Edl} edl
 * @param {'video'|'audio'} type
 * @returns {Track[]} Tracks of one type in display order
 */
export function tracksOfType(edl, type) {
  return edl.tracks.filter((track) => (track.type === 'audio') === (type === 'audio'));
}
