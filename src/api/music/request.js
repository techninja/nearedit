/**
 * What the music routes accept: a project that is registered, a song that
 * validates, a MIDI file inside the allowed folders. Everything wrong with
 * a request is said before anything is rendered or read.
 * @module api/music/request
 */

import { statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { validateSong } from '#utils/music/validate.js';
import { HttpError } from '../lib/httpErrors.js';
import { checkMediaPath } from '../lib/paths.js';
import { getProjectDir } from '../lib/registry.js';
import { MIDI_MAX_BYTES, notImported } from './midi.js';

const MIDI_EXTS = ['.mid', '.midi'];

/**
 * @param {any} body
 * @returns {string} The project's folder; '' when the body names no project
 * @throws {HttpError} 400 without a body, 404 for a project that is not registered
 */
function projectFolder(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON body required');
  if (body.projectId === undefined || body.projectId === '') return '';
  const folder = typeof body.projectId === 'string' ? getProjectDir(body.projectId) : null;
  if (!folder) throw new HttpError(404, 'Project not found');
  return folder;
}

/**
 * Validate the body of `POST /music/render`.
 * @param {any} body
 * @returns {{ folder: string, song: any }} The song as it was sent: it validates
 * @throws {HttpError} 400, 404, or 422 with one entry per problem of the song in `fields`
 */
export function parseRenderRequest(body) {
  const folder = projectFolder(body);
  if (!folder) throw new HttpError(400, 'projectId required');
  const { valid, problems } = validateSong(body.song);
  if (valid) return { folder, song: body.song };
  const fields = Object.fromEntries(problems.map(({ path, message }) => [path || 'song', message]));
  throw new HttpError(422, 'The song cannot be rendered', { fields });
}

/**
 * Validate the body of `POST /music/import`: the MIDI file it names.
 * @param {any} body - `{ projectId?, path }`: `path` absolute, or relative
 *   to the project folder
 * @returns {{ file: string }} The file to read: allowed, there, and small enough
 * @throws {HttpError} 400 without a path, 403 outside the allowed folders,
 *   404 missing, 422 for what is not named like a MIDI file or is too big
 */
export function parseImportRequest(body) {
  const folder = projectFolder(body);
  const name = body.path;
  if (typeof name !== 'string' || !name) throw new HttpError(400, 'path required');
  if (!folder && !isAbsolute(name))
    throw notImported('A relative path needs a project: send projectId');
  const checked = checkMediaPath(isAbsolute(name) ? name : resolve(folder, name));
  if (checked.ok === false) throw new HttpError(checked.status, checked.error);
  if (!MIDI_EXTS.includes(extname(checked.path).toLowerCase()))
    throw notImported('Not a MIDI file: its name must end in .mid or .midi');
  let stat;
  try {
    stat = statSync(checked.path);
  } catch {
    throw new HttpError(404, 'File not found'); // removed since the check
  }
  if (!stat.isFile()) throw new HttpError(404, 'Not a file');
  if (stat.size > MIDI_MAX_BYTES) {
    const size = (stat.size / 1024 / 1024).toFixed(1);
    throw notImported(`The file is ${size} MB; a MIDI file may be at most 5 MB`);
  }
  return { file: checked.path };
}
