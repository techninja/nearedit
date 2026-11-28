/**
 * What the web routes accept: a recipe that validates, a project that is
 * registered, a storage file inside the allowed folders. Everything wrong
 * is said before a browser starts.
 * @module api/web/request
 */

import { isAbsolute, resolve } from 'node:path';
import { normalizeRecipe, scoreFps, validateRecipe } from '#utils/web/index.js';
import { checkMediaPath } from '../lib/paths.js';
import { getProjectDir } from '../lib/registry.js';
import { WebError } from './errors.js';
import { readStorage } from './storage.js';

/**
 * Normalise a recipe, or say what is wrong with it.
 * @param {any} raw
 * @returns {import('#utils/web/types.js').Recipe}
 * @throws {WebError} 422 with one entry per problem in `fields`
 */
export function checkedRecipe(raw) {
  const { valid, problems } = validateRecipe(raw);
  if (valid) return normalizeRecipe(raw);
  const fields = Object.fromEntries(
    problems.map(({ path, message }) => [path || 'recipe', message]),
  );
  throw new WebError(422, 'The recipe cannot be recorded', { fields });
}

/**
 * The storage file a recipe names, read.
 * @param {string} name - `recipe.storage`: absolute, or relative to the folder
 * @param {string} folder - The project folder ('' when there is none)
 * @returns {import('./storage.js').Storage|null} null when the recipe names none
 * @throws {WebError} 403 outside the allowed folders, 404 missing, 422 unreadable
 */
export function projectStorage(name, folder) {
  if (!name) return null;
  if (!folder && !isAbsolute(name))
    throw new WebError(422, 'A storage file needs a project: send projectId', {
      fields: { 'recipe.storage': 'Relative to the project folder' },
    });
  const checked = checkMediaPath(isAbsolute(name) ? name : resolve(folder, name));
  if (checked.ok === false) throw new WebError(checked.status, `Storage file: ${checked.error}`);
  return readStorage(checked.path);
}

/**
 * @param {any} body
 * @returns {string} The project's folder; '' when the body names no project
 * @throws {WebError} 404 for a project that is not registered
 */
function projectFolder(body) {
  if (body.projectId === undefined || body.projectId === '') return '';
  const folder = typeof body.projectId === 'string' ? getProjectDir(body.projectId) : null;
  if (!folder) throw new WebError(404, 'Project not found');
  return folder;
}

/**
 * Validate the body of `POST /web/record`.
 * @param {any} body
 * @returns {{ projectId: string, folder: string, fps: number,
 *   recipe: import('#utils/web/types.js').Recipe, storage: import('./storage.js').Storage|null }}
 * @throws {WebError}
 */
export function parseRecordRequest(body) {
  if (!body || typeof body !== 'object') throw new WebError(400, 'JSON body required');
  const folder = projectFolder(body);
  if (!folder) throw new WebError(400, 'projectId required');
  if (body.fps !== undefined && !(Number(body.fps) >= 1 && Number(body.fps) <= 240))
    throw new WebError(422, 'Invalid fps', { fields: { fps: 'A number from 1 to 240' } });
  const recipe = checkedRecipe(body.recipe);
  const storage = projectStorage(recipe.storage, folder);
  return { projectId: body.projectId, folder, fps: scoreFps(Number(body.fps)), recipe, storage };
}

/**
 * Validate the body of `POST /web/snapshot`. Only the steps that will be
 * played have to be complete: a snapshot is how the next one gets written.
 * @param {any} body
 * @returns {{ recipe: import('#utils/web/types.js').Recipe, until: number|undefined,
 *   storage: import('./storage.js').Storage|null }}
 * @throws {WebError}
 */
export function parseSnapshotRequest(body) {
  if (!body || typeof body !== 'object') throw new WebError(400, 'JSON body required');
  const { until } = body;
  if (until !== undefined && !(Number.isInteger(until) && until >= 0))
    throw new WebError(422, 'Invalid until', {
      fields: { until: 'A whole number of steps, 0 or more' },
    });
  const raw = body.recipe;
  const played =
    until !== undefined && Array.isArray(raw?.steps)
      ? { ...raw, steps: raw.steps.slice(0, until) }
      : raw;
  const recipe = checkedRecipe(played);
  return { recipe, until, storage: projectStorage(recipe.storage, projectFolder(body)) };
}
