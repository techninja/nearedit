/**
 * EDL queries — read-only lookups shared by UI, playback, director, render.
 * Isomorphic and pure: never mutates its arguments.
 * @module utils/edl/query
 */

/**
 * Snap a time to the nearest frame boundary.
 * @param {number} time
 * @param {number} [fps=30]
 * @returns {number}
 */
export function snapToFrame(time, fps = 30) {
  return Math.round(time * fps) / fps;
}

/**
 * @param {{ timelineStart: number, timelineEnd: number }} clip
 * @returns {number}
 */
export function clipDuration(clip) {
  return clip.timelineEnd - clip.timelineStart;
}

/**
 * End time of the last clip on any track.
 * @param {{ tracks?: object[] } | object[]} edlOrTracks
 * @returns {number}
 */
export function timelineDuration(edlOrTracks) {
  const tracks = Array.isArray(edlOrTracks) ? edlOrTracks : edlOrTracks?.tracks || [];
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips || []) if (clip.timelineEnd > max) max = clip.timelineEnd;
  }
  return max;
}

/**
 * Display order: video tracks first, then audio; relative order preserved.
 * @param {object[]} tracks
 * @returns {object[]}
 */
export function sortedTracks(tracks) {
  const rank = (t) => (t.type === 'audio' ? 1 : 0);
  return [...tracks].sort((a, b) => rank(a) - rank(b));
}

/**
 * Tracks of one type that are currently heard/seen, honouring mute and solo.
 * @param {object[]} tracks
 * @param {'video'|'audio'} type
 * @returns {object[]} In display order (first = front-most for video)
 */
export function activeTracks(tracks, type) {
  const ofType = tracks.filter((t) => (type === 'audio') === (t.type === 'audio'));
  const anySolo = ofType.some((t) => t.solo);
  return ofType.filter((t) => !t.muted && (!anySolo || t.solo));
}

/**
 * Clips on a track covering a time (two during a cross-fade).
 * @param {{ clips: object[] }} track
 * @param {number} time
 * @returns {object[]} Sorted by timelineStart
 */
export function clipsAt(track, time) {
  return (track.clips || [])
    .filter((c) => time >= c.timelineStart && time < c.timelineEnd)
    .sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * Locate a clip by id.
 * @param {{ tracks: object[] }} edl
 * @param {string} clipId
 * @returns {{ clip: any, track: any, trackIndex: number, clipIndex: number } | null}
 */
export function findClip(edl, clipId) {
  if (!clipId) return null;
  for (let trackIndex = 0; trackIndex < edl.tracks.length; trackIndex++) {
    const track = edl.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((c) => c.clipId === clipId);
    if (clipIndex >= 0) return { clip: track.clips[clipIndex], track, trackIndex, clipIndex };
  }
  return null;
}

/**
 * Every clip with its owning track, in track then time order.
 * @param {{ tracks: object[] }} edl
 * @returns {{ clip: any, track: any }[]}
 */
export function allClips(edl) {
  return edl.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track })));
}

/**
 * Map a timeline time to the matching time inside a clip's source.
 * @param {{ sourceIn: number, timelineStart: number }} clip
 * @param {number} time - Timeline seconds
 * @returns {number}
 */
export function sourceTimeAt(clip, time) {
  return clip.sourceIn + (time - clip.timelineStart);
}
