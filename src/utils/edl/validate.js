/**
 * Document validation: check an EDL against the schema and every invariant
 * in docs/app-spec/EDL.md. Used by the server before saving and by tests
 * after every operation. Isomorphic and pure.
 * @module utils/edl/validate
 */

import { EDL_VERSION } from './defaults.js';
import { isObject } from './sanitize.js';
import { checkClip, checkOverlaps, isGain } from './validateClip.js';

/**
 * @typedef {Object} Problem
 * @property {string} path - e.g. `tracks[0].clips[3].fadeIn`
 * @property {string} message
 */

/**
 * @param {any} track
 * @param {string} path
 * @param {import('./validateClip.js').Report} report
 * @returns {boolean} False when the track cannot be inspected further
 */
function checkTrack(track, path, report) {
  if (!isObject(track)) return (report(path, 'must be an object'), false);
  if (typeof track.trackId !== 'string' || !track.trackId) report(`${path}.trackId`, 'is required');
  if (track.type !== 'video' && track.type !== 'audio') {
    report(`${path}.type`, 'must be video or audio');
  }
  if (typeof track.name !== 'string') report(`${path}.name`, 'must be a string');
  for (const flag of ['muted', 'solo', 'locked']) {
    if (typeof track[flag] !== 'boolean') report(`${path}.${flag}`, 'must be a boolean');
  }
  if (!isGain(track.volume)) report(`${path}.volume`, 'must be a number 0..2');
  if (!Array.isArray(track.clips)) return (report(`${path}.clips`, 'must be an array'), false);
  return true;
}

/**
 * @param {any} markers
 * @param {Set<string>} ids
 * @param {import('./validateClip.js').Report} report
 */
function checkMarkers(markers, ids, report) {
  if (!Array.isArray(markers)) return report('markers', 'must be an array');
  markers.forEach((marker, i) => {
    const path = `markers[${i}]`;
    if (!isObject(marker)) return report(path, 'must be an object');
    if (typeof marker.markerId !== 'string' || !marker.markerId) report(path, 'needs a markerId');
    else if (ids.has(marker.markerId)) report(`${path}.markerId`, 'is not unique');
    else ids.add(marker.markerId);
    if (!(marker.time >= 0) || !Number.isFinite(marker.time))
      report(`${path}.time`, 'must be >= 0');
    if (i && marker.time < markers[i - 1]?.time) report(path, 'markers must be sorted by time');
    for (const key of ['label', 'color']) {
      if (typeof marker[key] !== 'string') report(`${path}.${key}`, 'must be a string');
    }
  });
}

/**
 * Validate a document.
 * @param {any} edl
 * @param {{ sourceDurations?: import('./types.js').SourceDurations }} [opts] -
 *   With source durations, `sourceOut` is checked against them (invariant 2)
 * @returns {{ valid: boolean, problems: Problem[] }}
 */
export function validateEdl(edl, opts = {}) {
  /** @type {Problem[]} */
  const problems = [];
  const report = (path, message) => void problems.push({ path, message });
  const done = () => ({ valid: problems.length === 0, problems });
  if (!isObject(edl)) return (report('', 'document must be an object'), done());
  if (edl.version !== EDL_VERSION) report('version', `must be ${EDL_VERSION}`);
  if (!(edl.fps > 0) || !Number.isFinite(edl.fps)) report('fps', 'must be a positive number');
  if (typeof edl.resolution !== 'string' || !/^[1-9]\d*x[1-9]\d*$/.test(edl.resolution)) {
    report('resolution', 'must look like 1920x1080');
  }
  checkMarkers(edl.markers, new Set(), report);
  if (!Array.isArray(edl.tracks)) return (report('tracks', 'must be an array'), done());

  const trackIds = new Set();
  /** @type {Map<string, any>} */
  const clips = new Map();
  let audioSeen = false;
  edl.tracks.forEach((track, t) => {
    const path = `tracks[${t}]`;
    if (!checkTrack(track, path, report)) return;
    if (trackIds.has(track.trackId)) report(`${path}.trackId`, 'is not unique');
    trackIds.add(track.trackId);
    if (track.type === 'audio') audioSeen = true;
    else if (audioSeen) report(path, 'video tracks must come before audio tracks');
    const sound = track.clips.filter((clip, c) => {
      const at = `${path}.clips[${c}]`;
      const ok = checkClip(clip, track, at, report, { ...opts, fps: edl.fps });
      if (ok && clips.has(clip.clipId)) report(`${at}.clipId`, 'is not unique');
      if (isObject(clip)) clips.set(clip.clipId, { clip, at });
      return ok;
    });
    if (sound.length === track.clips.length) checkOverlaps(sound, path, report);
  });
  for (const type of ['video', 'audio']) {
    if (!edl.tracks.some((track) => track?.type === type)) {
      report('tracks', `needs at least one ${type} track`);
    }
  }
  for (const { clip, at } of clips.values()) {
    if (!clip.linkedClipId) continue;
    const partner = clips.get(clip.linkedClipId)?.clip;
    if (!partner || partner === clip) report(`${at}.linkedClipId`, 'links to a missing clip');
    else if (partner.linkedClipId !== clip.clipId) {
      report(`${at}.linkedClipId`, 'link is not symmetric (invariant 5)');
    }
  }
  return done();
}
