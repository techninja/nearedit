/**
 * Playback scheduling — which clips are seen or heard at a moment, and
 * which are about to be. Shared by the compositor and the audio mixer so
 * both read mute/solo, clip kinds and layer order the same way.
 * Pure and isomorphic.
 * @module utils/playback/schedule
 */

import { clipKind } from '#utils/edl/factory.js';
import { activeTracks } from '#utils/edl/query.js';

/**
 * @typedef {Object} Cue
 * @property {any} clip
 * @property {any} track
 * @property {'video'|'image'|'title'|'audio'} kind
 * @property {boolean} active - Covers the time now; false = starts within the lookahead
 */

/**
 * Clips on a track that cover a time or start within `lookahead` seconds.
 * @param {{ clips?: any[] }} track
 * @param {number} time - Timeline seconds
 * @param {number} [lookahead=0] - Seconds
 * @returns {any[]} Sorted by timelineStart
 */
export function clipsNear(track, time, lookahead = 0) {
  return (track.clips || [])
    .filter((clip) => time < clip.timelineEnd && time >= clip.timelineStart - lookahead)
    .sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * Audio clips to sound now or cue for the near future, on every audible
 * audio track (mute and solo honoured).
 * @param {any[]} tracks
 * @param {number} time - Timeline seconds
 * @param {number} [lookahead=0] - Seconds
 * @returns {Cue[]}
 */
export function audioCues(tracks, time, lookahead = 0) {
  /** @type {Cue[]} */
  const cues = [];
  for (const track of activeTracks(tracks || [], 'audio')) {
    for (const clip of clipsNear(track, time, lookahead)) {
      if (clipKind(clip, track) !== 'audio') continue;
      cues.push({ clip, track, kind: 'audio', active: time >= clip.timelineStart });
    }
  }
  return cues;
}

/**
 * Picture clips to draw now or prepare for the near future, **back to
 * front**: last visible video track first, the first video track (the
 * front-most layer) last; clips of one track in start order. Placeholders
 * and audio-only files on video tracks draw nothing and are left out.
 * @param {any[]} tracks
 * @param {number} time - Timeline seconds
 * @param {number} [lookahead=0] - Seconds
 * @returns {Cue[]}
 */
export function videoCues(tracks, time, lookahead = 0) {
  /** @type {Cue[]} */
  const cues = [];
  const visible = activeTracks(tracks || [], 'video');
  for (let i = visible.length - 1; i >= 0; i--) {
    const track = visible[i];
    for (const clip of clipsNear(track, time, lookahead)) {
      const kind = clipKind(clip, track);
      if (kind === 'placeholder' || kind === 'audio') continue;
      cues.push({ clip, track, kind, active: time >= clip.timelineStart });
    }
  }
  return cues;
}

/**
 * The layers of the frame at a moment, back to front.
 * @param {any[]} tracks
 * @param {number} time - Timeline seconds
 * @returns {Cue[]}
 */
export function videoLayers(tracks, time) {
  return videoCues(tracks, time, 0);
}

/**
 * Fingerprint of everything that shapes how a clip sounds. When it changes
 * the mixer re-schedules that clip's gain and re-checks its position.
 * @param {{ volume?: number }} track
 * @param {any} clip
 * @returns {string}
 */
export function audioSignature(track, clip) {
  return [
    clip.sourceFile,
    clip.sourceIn,
    clip.timelineStart,
    clip.timelineEnd,
    clip.fadeIn,
    clip.fadeOut,
    clip.volume ?? 1,
    track.volume ?? 1,
  ].join('|');
}
