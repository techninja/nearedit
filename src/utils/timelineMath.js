/**
 * Timeline math — pixel/time conversions and clip operations.
 * @module utils/timelineMath
 */

const PX_PER_SECOND = 100;

/**
 * Convert seconds to pixel offset at a given zoom level.
 * @param {number} seconds
 * @param {number} zoom
 * @returns {number}
 */
export function timeToPx(seconds, zoom = 1) {
  return seconds * PX_PER_SECOND * zoom;
}

/**
 * Convert pixel offset to seconds at a given zoom level.
 * @param {number} px
 * @param {number} zoom
 * @returns {number}
 */
export function pxToTime(px, zoom = 1) {
  return px / (PX_PER_SECOND * zoom);
}

/**
 * Snap a time value to the nearest frame boundary.
 * @param {number} time
 * @param {number} fps
 * @returns {number}
 */
export function snapToFrame(time, fps = 30) {
  return Math.round(time * fps) / fps;
}

/**
 * Split a clip at a given time, returning two new clips.
 * @param {object} clip
 * @param {number} splitTime - Timeline time to split at
 * @returns {[object, object]}
 */
export function splitClip(clip, splitTime) {
  const offset = splitTime - clip.timelineStart;
  const splitSource = clip.sourceIn + offset;

  const left = {
    ...clip,
    clipId: clip.clipId + '_L',
    sourceOut: splitSource,
    timelineEnd: splitTime,
    fadeOut: 0,
  };
  const right = {
    ...clip,
    clipId: clip.clipId + '_R',
    sourceIn: splitSource,
    timelineStart: splitTime,
    fadeIn: 0,
  };
  return [left, right];
}

/**
 * Calculate total timeline duration from all tracks.
 * @param {object[]} tracks
 * @returns {number}
 */
export function totalDuration(tracks) {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.timelineEnd > max) max = clip.timelineEnd;
    }
  }
  return max;
}
