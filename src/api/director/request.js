/**
 * Request preparation for the director routes — everything that can be
 * checked before a job starts, so bad input is a 4xx answer and never a
 * failed job. Body shape: docs/app-spec/API.md § Director.
 * @module api/director/request
 */

import { getAction } from '#utils/director/actions.js';
import { normalizeDirective } from '#utils/director/directive.js';
import { clamp } from '#utils/director/snap.js';
import { createClip, parseResolution } from '#utils/edl/factory.js';
import { getAdaptation, getProjectDir } from '../lib/registry.js';
import { DirectorError } from './errors.js';
import { checkScriptSource } from './scripts/files.js';

/**
 * @typedef {Object} Prepared
 * @property {string} projectId
 * @property {string} projectDir
 * @property {string} adaptationId
 * @property {import('#utils/director/directive.js').Directive} directive
 * @property {import('#utils/director/actions.js').ActionSchema} action
 * @property {any} edl - The posted document with complete v2 clips, or null
 * @property {import('./pipeline.js').ActionContext['format']} format
 */

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

/**
 * Validate a director request body.
 * @param {any} body - `{ projectId, adaptationId, directive, edl }`
 * @param {'director'|'script'} route
 * @returns {Prepared}
 * @throws {DirectorError} 400, 404 or 422
 */
export function prepareRequest(body, route) {
  if (!body || typeof body !== 'object')
    throw new DirectorError('A JSON body is required', { status: 400 });
  const raw = body.directive;
  const implied = route === 'script' && raw && typeof raw === 'object' && !raw.action;
  const normal = normalizeDirective(implied ? { ...raw, action: 'generate_script' } : raw);
  if (normal.ok === false)
    throw new DirectorError(normal.error, { status: normal.status, fields: normal.fields });
  const { directive } = normal;
  const action = getAction(directive.action);
  if (route === 'script' && action.jobType !== 'script')
    throw new DirectorError('POST /director/script only runs generate_script', {
      status: 400,
      detail: `Send "${action.id}" to POST /director.`,
    });

  if (typeof body.projectId !== 'string' || !body.projectId)
    throw new DirectorError('projectId required', { status: 400 });
  const projectDir = getProjectDir(body.projectId);
  if (!projectDir) throw new DirectorError('Project not found', { status: 404 });
  const adaptation = getAdaptation(body.projectId, body.adaptationId || undefined);
  if (body.adaptationId && !adaptation)
    throw new DirectorError('Adaptation not found', { status: 404 });

  const edl = checkEdl(body.edl);
  const overlay = action.id === 'insert_broll' && directive.params.placement === 'overlay';
  if ((action.inPlace || overlay) && !edl)
    throw new DirectorError('This action works on the timeline', {
      status: 422,
      fields: { edl: 'Send the current timeline document as "edl"' },
    });
  if (action.id === 'execute_script') checkScriptSource(directive);

  // A generated fragment that replaces a range should, by default, fill it.
  const length = action.fields.find((f) => f.key === 'duration');
  if (directive.mode === 'range' && length && !action.inPlace && action.id !== 'insert_broll') {
    const span = directive.context.range.end - directive.context.range.start;
    if (!directive.given.includes('duration'))
      directive.params.duration = clamp(span, length.min, length.max);
  }

  const { width, height } = parseResolution(edl?.resolution || adaptation?.resolution);
  return {
    projectId: body.projectId,
    projectDir,
    adaptationId: adaptation?.id || '',
    directive,
    action,
    edl,
    format: {
      fps: Number(edl?.fps) || Number(adaptation?.fps) || 30,
      width,
      height,
      aspectRatio: adaptation?.aspectRatio || '',
      name: adaptation?.name || 'Main Edit',
    },
  };
}
