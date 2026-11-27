/**
 * Test helper: build small v2 timeline documents by hand.
 * @module api/director/testing/timeline
 */

import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';

/**
 * A media clip playing `sourceIn..sourceOut` at `at` on the timeline.
 * @param {string} sourceFile
 * @param {number} sourceIn
 * @param {number} sourceOut
 * @param {number} at
 * @param {object} [extra]
 * @returns {any}
 */
export function clip(sourceFile, sourceIn, sourceOut, at, extra = {}) {
  return createClip({
    sourceFile,
    sourceIn,
    sourceOut,
    timelineStart: at,
    timelineEnd: at + (sourceOut - sourceIn),
    ...extra,
  });
}

/**
 * A linked picture + sound pair of one file.
 * @param {string} sourceFile
 * @param {number} sourceIn
 * @param {number} sourceOut
 * @param {number} at
 * @returns {[any, any]} [video clip, audio clip]
 */
export function pair(sourceFile, sourceIn, sourceOut, at) {
  const video = clip(sourceFile, sourceIn, sourceOut, at);
  const audio = clip(sourceFile, sourceIn, sourceOut, at);
  video.linkedClipId = audio.clipId;
  audio.linkedClipId = video.clipId;
  return [video, audio];
}

/**
 * A title clip.
 * @param {string} content
 * @param {number} start
 * @param {number} end
 * @returns {any}
 */
export function title(content, start, end) {
  return createClip({ timelineStart: start, timelineEnd: end, text: { content }, intent: 'title' });
}

/**
 * A document from lists of clips: `{ video: [[…], […]], audio: [[…]] }`,
 * front-most video track first.
 * @param {{ video?: any[][], audio?: any[][] }} layout
 * @param {object} [overrides] - Document fields
 * @returns {any}
 */
export function doc(layout, overrides = {}) {
  const make =
    (/** @type {'video'|'audio'} */ type) =>
    (/** @type {any[]} */ clips, /** @type {number} */ i) =>
      createTrack(type, {
        trackId: `${type[0]}${i + 1}`,
        name: `${type === 'audio' ? 'Audio' : 'Video'} ${i + 1}`,
        clips,
      });
  return createEdl({
    tracks: [
      ...(layout.video || []).map(make('video')),
      ...(layout.audio || []).map(make('audio')),
    ],
    ...overrides,
  });
}

/**
 * Clips of a result track, by type and index.
 * @param {any} result - DirectorResult
 * @param {'video'|'audio'} type
 * @param {number} index
 * @returns {any[]}
 */
export function trackClips(result, type, index) {
  return result.tracks.find((t) => t.type === type && t.index === index)?.clips || [];
}
