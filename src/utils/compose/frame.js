/**
 * The two descriptions every generator and effect receives: `frame` (the
 * canvas being drawn) and `time` (where in a clip this moment falls).
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § Time and size.
 * @module utils/compose/frame
 */

import { clipLocalTime } from '#utils/edl/animate.js';
import { parseResolution } from '#utils/edl/factory.js';
import { timelineDuration } from '#utils/edl/query.js';

/**
 * @typedef {Object} Frame
 * @property {number} width - Canvas width, pixels
 * @property {number} height - Canvas height, pixels
 * @property {number} scale - Canvas pixels per output pixel: multiply every
 *   length from the document by this before drawing
 * @property {number} fps - Output frame rate
 * @property {number} outWidth - Output (document) width, pixels
 * @property {number} outHeight - Output (document) height, pixels
 * @property {any[]} [fonts] - The document's own fonts (`edl.fonts`), when
 *   it has any: text is styled with `textStyle(text, frame.fonts)`
 */

/**
 * @typedef {Object} Time
 * @property {number} t - Clip-local source time, seconds (the keyframe time base)
 * @property {number} age - Seconds since the clip's start on the timeline
 * @property {number} remaining - Seconds until the clip's end
 * @property {number} duration - Clip length, seconds
 * @property {number} frame - Output frame number of this moment
 */

/**
 * Describe a canvas of a given size for a document.
 * @param {{ resolution?: string, fps?: number, fonts?: any[] }} edl
 * @param {number} width - Canvas width, pixels
 * @param {number} height - Canvas height, pixels
 * @returns {Frame}
 */
export function frameInfo(edl, width, height) {
  const out = parseResolution(edl.resolution);
  return {
    width,
    height,
    scale: width / out.width,
    fps: edl.fps > 0 ? edl.fps : 30,
    outWidth: out.width,
    outHeight: out.height,
    ...(edl.fonts?.length && { fonts: edl.fonts }),
  };
}

/**
 * Where a moment falls in a clip.
 * @param {{ sourceIn?: number, timelineStart: number, timelineEnd: number }} clip
 * @param {number} time - Timeline seconds
 * @param {number} fps
 * @returns {Time}
 */
export function clipTime(clip, time, fps) {
  return {
    t: clipLocalTime(clip, time),
    age: time - clip.timelineStart,
    remaining: clip.timelineEnd - time,
    duration: clip.timelineEnd - clip.timelineStart,
    frame: Math.round(time * fps),
  };
}

/**
 * The same description for something that spans the whole timeline (a
 * track's effects): its "clip" is the timeline.
 * @param {{ tracks: any[] }} edl
 * @param {number} time - Timeline seconds
 * @param {number} fps
 * @returns {Time}
 */
export function timelineTime(edl, time, fps) {
  const duration = timelineDuration(edl.tracks);
  return {
    t: time,
    age: time,
    remaining: duration - time,
    duration,
    frame: Math.round(time * fps),
  };
}
