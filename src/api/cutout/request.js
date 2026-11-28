/**
 * What `POST /cutout` accepts: a registered project, a video inside the
 * allowed media folders, a stretch of it that is not empty and not longer
 * than half an hour. Everything wrong with a request is said before a job
 * exists.
 * @module api/cutout/request
 */

import { isAbsolute, resolve } from 'node:path';
import { CUTOUT_MAX_SECONDS, frameRange } from '#utils/cutout/index.js';
import { clipKind } from '#utils/edl/clipKind.js';
import { HttpError } from '../lib/httpErrors.js';
import { checkMediaPath } from '../lib/paths.js';
import { cachedProbe } from '../lib/probeCache.js';
import { getProjectDir } from '../lib/registry.js';

/**
 * @typedef {Object} CutoutRequest
 * @property {string} projectId
 * @property {string} folder - The project's folder
 * @property {string} path - The media file, absolute
 * @property {number} start - Seconds, on the frame grid
 * @property {number} end
 * @property {number} fps
 * @property {number} frames
 */

/**
 * @param {string} field
 * @param {string} message
 * @returns {HttpError} A 422 naming the field
 */
const invalid = (field, message) =>
  new HttpError(422, `Invalid ${field}`, { fields: { [field]: message } });

/**
 * Validate the body of `POST /cutout`.
 * @param {any} body - `{ projectId, path, start, end, fps? }`: `path`
 *   absolute, or relative to the project folder; `start` and `end` in
 *   seconds of the file; `fps` the document's (30)
 * @returns {Promise<CutoutRequest>}
 * @throws {HttpError} 400 without a body, a project or a path, 403 outside
 *   the allowed folders, 404 for an unknown project or a missing file, 422
 *   for what is not a video, not a frame rate, or not a stretch of at most
 *   half an hour inside the file
 */
export async function parseCutoutRequest(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON body required');
  if (typeof body.projectId !== 'string' || !body.projectId)
    throw new HttpError(400, 'projectId required');
  const folder = getProjectDir(body.projectId);
  if (!folder) throw new HttpError(404, 'Project not found');
  if (typeof body.path !== 'string' || !body.path) throw new HttpError(400, 'path required');
  const checked = checkMediaPath(isAbsolute(body.path) ? body.path : resolve(folder, body.path));
  if (checked.ok === false) throw new HttpError(checked.status, checked.error);
  const { path } = checked;

  const fps = body.fps === undefined ? 30 : Number(body.fps);
  if (!(fps >= 1 && fps <= 240)) throw invalid('fps', 'A number from 1 to 240');
  const [start, end] = [body.start, body.end].map((value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : NaN,
  );
  if (!(start >= 0)) throw invalid('start', 'Seconds into the file, 0 or more');
  if (!(end > start)) throw invalid('end', 'Seconds into the file, after start');
  const range = frameRange(start, end, fps);
  if (range.end - range.start > CUTOUT_MAX_SECONDS + 1e-6)
    throw invalid('end', `At most ${CUTOUT_MAX_SECONDS / 60} minutes after start`);

  if (clipKind({ sourceFile: path }) !== 'video')
    throw invalid('path', 'Only a video can be cut out: this is a still or a sound file');
  const probe = await cachedProbe(path);
  if (!probe?.hasVideo) throw invalid('path', 'The file has no picture FFmpeg can read');
  if (probe.duration !== null && range.start >= probe.duration)
    throw invalid('start', `The file is ${probe.duration.toFixed(2)} s long`);
  return { projectId: body.projectId, folder, path, ...range };
}
