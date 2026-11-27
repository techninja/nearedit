/**
 * Validation of the project fields a client may set.
 * @module api/projects/projectFields
 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { HttpError, assertValid } from '../lib/httpErrors.js';
import { isBrowsablePath } from '../lib/paths.js';

export const PROJECT_STATUSES = ['active', 'archived'];
const MAX_NAME = 200;
const MAX_DESCRIPTION = 5000;

/**
 * @param {string} dir
 * @returns {boolean}
 */
function isDirectory(dir) {
  return existsSync(dir) && statSync(dir).isDirectory();
}

/**
 * Validate a folder a client wants the server to work in. It must be absolute
 * and inside the browse roots — these folders become readable through the
 * media routes, so this is what keeps the rest of the host private.
 * @param {unknown} value
 * @param {string} field - Field name used in validation errors
 * @returns {string} The resolved absolute path
 * @throws {HttpError} 422 when not an absolute path, 403 when outside the browse roots
 */
export function cleanFolderPath(value, field) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || !isAbsolute(raw)) assertValid({ [field]: 'An absolute folder path is required' });
  const dir = resolve(raw);
  if (!isBrowsablePath(dir)) {
    throw new HttpError(403, 'Path is outside the folders this server may browse', { detail: dir });
  }
  return dir;
}

/**
 * @param {unknown} value
 * @returns {string|null} The trimmed name, or null when it is not usable
 */
export function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= MAX_NAME ? name : null;
}

/**
 * Validate a mediaFolders list. Folders the project already has are kept as
 * they are (a drive may be unplugged right now); new ones must be existing
 * folders inside the browse roots.
 * @param {unknown} value
 * @param {string[]} current - The project's present mediaFolders
 * @returns {string[]} Resolved, de-duplicated paths
 * @throws {HttpError} 422 or 403
 */
function cleanMediaFolders(value, current) {
  if (!Array.isArray(value) || value.some((f) => typeof f !== 'string')) {
    assertValid({ mediaFolders: 'Must be an array of absolute folder paths' });
  }
  const known = new Set(current.map((f) => resolve(f)));
  const folders = new Set();
  for (const raw of /** @type {string[]} */ (value)) {
    if (!raw.trim()) continue;
    if (isAbsolute(raw.trim()) && known.has(resolve(raw.trim()))) {
      folders.add(resolve(raw.trim()));
      continue;
    }
    const dir = cleanFolderPath(raw, 'mediaFolders');
    if (!isDirectory(dir)) assertValid({ mediaFolders: `Folder not found: ${dir}` });
    folders.add(dir);
  }
  return [...folders];
}

/**
 * Validate and clean the settable fields found in a request body. Only keys
 * that are present are checked and returned; unknown keys are ignored.
 * @param {any} body
 * @param {{ mediaFolders?: string[] }} project - The project being updated
 * @returns {{ name?: string, description?: string, status?: string, mediaFolders?: string[] }}
 * @throws {HttpError} 422 with per-field messages, 403 for a folder outside the browse roots
 */
export function cleanProjectFields(body, project) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {ReturnType<typeof cleanProjectFields>} */
  const clean = {};
  const input = body && typeof body === 'object' ? body : {};

  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (name) clean.name = name;
    else fields.name = `name is required (maximum ${MAX_NAME} characters)`;
  }
  if (input.description !== undefined) {
    const ok = typeof input.description === 'string' && input.description.length <= MAX_DESCRIPTION;
    if (ok) clean.description = input.description;
    else fields.description = `Must be text of at most ${MAX_DESCRIPTION} characters`;
  }
  if (input.status !== undefined) {
    if (PROJECT_STATUSES.includes(input.status)) clean.status = input.status;
    else fields.status = `Must be one of: ${PROJECT_STATUSES.join(', ')}`;
  }
  assertValid(fields);
  if (input.mediaFolders !== undefined) {
    const current = Array.isArray(project.mediaFolders) ? project.mediaFolders : [];
    const usable = current.filter((f) => typeof f === 'string' && f);
    clean.mediaFolders = cleanMediaFolders(input.mediaFolders, usable);
  }
  return clean;
}
