/**
 * Structural guard for EDL documents arriving over HTTP. It refuses anything
 * that would break the timeline, the director or the renderer when read back:
 * a missing track list, tracks without an id or type, clips without finite
 * times (a NaN serialises to `null`, which is how most broken saves look).
 *
 * This is deliberately not a normaliser — it changes nothing and knows
 * nothing about cross-fades or defaults. See EDL.md for the full schema.
 * @module api/projects/edlGuard
 */

import { RESOLUTION_PATTERN } from './adaptationFields.js';

const TRACK_TYPES = ['video', 'audio'];
const CLIP_TIMES = ['sourceIn', 'sourceOut', 'timelineStart', 'timelineEnd'];
const CLIP_OPTIONAL_NUMBERS = ['fadeIn', 'fadeOut', 'volume'];
/** Enough to show what is wrong without echoing a whole broken document. */
const MAX_PROBLEMS = 20;

/** @param {unknown} value @returns {boolean} */
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {boolean} */
const isId = (value) => typeof value === 'string' && value.length > 0;

/**
 * @param {any} clip
 * @param {string} where - e.g. "tracks[0].clips[3]"
 * @param {Record<string, string>} problems - Collected in place
 */
function checkClip(clip, where, problems) {
  if (!isObject(clip)) {
    problems[where] = 'must be an object';
    return;
  }
  if (!isId(clip.clipId)) problems[`${where}.clipId`] = 'must be a non-empty string';
  for (const key of CLIP_TIMES) {
    if (!Number.isFinite(clip[key])) problems[`${where}.${key}`] = 'must be a finite number';
  }
  for (const key of CLIP_OPTIONAL_NUMBERS) {
    if (clip[key] !== undefined && !Number.isFinite(clip[key])) {
      problems[`${where}.${key}`] = 'must be a finite number';
    }
  }
}

/**
 * @param {any} track
 * @param {string} where - e.g. "tracks[0]"
 * @param {Record<string, string>} problems - Collected in place
 */
function checkTrack(track, where, problems) {
  if (!isObject(track)) {
    problems[where] = 'must be an object';
    return;
  }
  if (!isId(track.trackId)) problems[`${where}.trackId`] = 'must be a non-empty string';
  if (!TRACK_TYPES.includes(track.type)) problems[`${where}.type`] = 'must be "video" or "audio"';
  if (!Array.isArray(track.clips)) {
    problems[`${where}.clips`] = 'must be an array';
    return;
  }
  track.clips.forEach((clip, index) => {
    if (Object.keys(problems).length < MAX_PROBLEMS) {
      checkClip(clip, `${where}.clips[${index}]`, problems);
    }
  });
}

/**
 * Check the structure of an EDL document.
 * @param {unknown} doc - Parsed request body
 * @returns {Record<string, string>} Location → problem; empty when the document is sound
 */
export function checkEdl(doc) {
  /** @type {Record<string, string>} */
  const problems = {};
  if (!isObject(doc)) return { document: 'must be a JSON object' };
  const edl = /** @type {any} */ (doc);

  if (edl.fps !== undefined && !(Number.isFinite(edl.fps) && edl.fps > 0)) {
    problems.fps = 'must be a positive number';
  }
  if (edl.resolution !== undefined && !RESOLUTION_PATTERN.test(String(edl.resolution))) {
    problems.resolution = 'must look like 1920x1080';
  }
  if (edl.markers !== undefined) {
    if (!Array.isArray(edl.markers)) problems.markers = 'must be an array';
    else {
      edl.markers.forEach((marker, index) => {
        if (!isObject(marker) || !Number.isFinite(marker.time)) {
          problems[`markers[${index}].time`] = 'must be a finite number';
        }
      });
    }
  }
  if (!Array.isArray(edl.tracks)) {
    problems.tracks = 'must be an array';
    return problems;
  }
  edl.tracks.forEach((track, index) => {
    if (Object.keys(problems).length < MAX_PROBLEMS)
      checkTrack(track, `tracks[${index}]`, problems);
  });
  return problems;
}
