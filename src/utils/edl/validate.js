/**
 * Document validation: check an EDL against the schema and every invariant
 * in docs/app-spec/EDL.md. Used by the server before saving and by tests
 * after every operation. Isomorphic and pure.
 * @module utils/edl/validate
 */

import { cleanFonts, sameFonts } from '#utils/brand/fontTable.js';
import { checkCutout } from '#utils/cutout/block.js';
import { checkCaptions, checkDocumentCaptions } from './captionField.js';
import { clipKind } from './clipKind.js';
import { BACKGROUND_COLOR, EDL_VERSION } from './defaults.js';
import { isObject } from './sanitize.js';
import { checkClip, checkOverlaps, checkShape, isGain } from './validateClip.js';
import { checkEffects } from './validateExtras.js';
import { checkMarkers, checkRegions } from './validateMarks.js';
import { fontEnums } from './fontEnums.js';

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
  if (!(track.opacity >= 0 && track.opacity <= 1)) report(`${path}.opacity`, 'must be 0..1');
  checkShape(track, { blendMode: '' }, path, report);
  checkEffects(track.effects, `${path}.effects`, report);
  if (!Array.isArray(track.clips)) return (report(`${path}.clips`, 'must be an array'), false);
  return true;
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
  if (typeof edl.background !== 'string' || !BACKGROUND_COLOR.test(edl.background)) {
    report('background', 'must be a colour like #000000');
  }
  // Absent, or exactly the usable entries: each face once, no bundled family.
  const fonts = edl.fonts === undefined ? [] : edl.fonts;
  if (!Array.isArray(fonts) || !fonts.length !== (edl.fonts === undefined)) {
    report('fonts', 'must be a list of font files, or absent when there are none');
  } else if (!sameFonts(fonts, cleanFonts(fonts)) || fonts.some((face) => !isObject(face))) {
    report('fonts', 'must hold { family, weight, style, file }, each face once (see cleanFonts)');
  }
  const enums = fontEnums(Array.isArray(edl.fonts) ? edl.fonts : undefined);
  checkDocumentCaptions(edl.captions, report);
  checkMarkers(edl.markers, report);
  checkRegions(edl.regions, report);
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
      const ok = checkClip(clip, track, at, report, { ...opts, fps: edl.fps, enums });
      if (ok && clips.has(clip.clipId)) report(`${at}.clipId`, 'is not unique');
      if (isObject(clip)) {
        checkCaptions(clip, track, at, report);
        checkCutout(clip.cutout, `${at}.cutout`, report);
        if (clip.cutout !== undefined && clipKind(clip, track) !== 'video')
          report(`${at}.cutout`, 'only a clip that plays a video file has a cutout');
        clips.set(clip.clipId, { clip, at });
      }
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
