/**
 * Checking the timeline a director request posts, before a job exists: a
 * document that cannot be worked on is a 422 answer, never a failed job.
 * @module api/director/checkEdl
 */

import { createClip } from '#utils/edl/factory.js';
import { DirectorError } from './errors.js';

const bad = (/** @type {string} */ why) =>
  new DirectorError('Invalid edl', { status: 422, fields: { edl: why } });

/**
 * Check the posted timeline and complete its clips with v2 defaults.
 * @param {any} edl
 * @returns {any|null} null when no document was posted
 * @throws {DirectorError} 422 for a document that cannot be worked on
 */
export function checkEdl(edl) {
  if (edl === undefined || edl === null) return null;
  if (typeof edl !== 'object' || !Array.isArray(edl.tracks))
    throw bad('edl.tracks must be an array');
  const tracks = edl.tracks.map((/** @type {any} */ track, /** @type {number} */ t) => {
    if (!track || !Array.isArray(track.clips)) throw bad(`tracks[${t}].clips must be an array`);
    if (track.type !== 'video' && track.type !== 'audio')
      throw bad(`tracks[${t}].type must be "video" or "audio"`);
    const clips = track.clips.map((/** @type {any} */ clip, /** @type {number} */ c) => {
      const where = `tracks[${t}].clips[${c}]`;
      if (!clip || typeof clip.clipId !== 'string' || !clip.clipId)
        throw bad(`${where}.clipId missing`);
      const times = [clip.timelineStart, clip.timelineEnd, clip.sourceIn ?? 0, clip.sourceOut ?? 0];
      if (!times.every(Number.isFinite)) throw bad(`${where} has a time that is not a number`);
      if (clip.timelineStart < 0 || clip.timelineEnd <= clip.timelineStart)
        throw bad(`${where} must have timelineEnd > timelineStart >= 0`);
      if (clip.sourceFile !== undefined && typeof clip.sourceFile !== 'string')
        throw bad(`${where}.sourceFile must be text`);
      return createClip(clip);
    });
    return { ...track, clips };
  });
  return { ...edl, tracks };
}
