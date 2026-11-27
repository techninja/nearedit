/**
 * Server-side folder browser — lets the UI pick project and media folders
 * on a headless server where no native dialog exists. It only ever lists
 * directories, and only inside BROWSE_ROOTS.
 * Contract: docs/app-spec/API.md § Folder browser.
 * @module api/browse
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Router } from 'express';
import { getConfig } from './lib/config.js';
import { HttpError, assertValid, errorHandler, isAccessDenied } from './lib/httpErrors.js';
import { stringParam } from './lib/params.js';
import { isBrowsablePath } from './lib/paths.js';
import { projectFilePath } from './lib/registry.js';

export const browseRouter = Router();

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** Path separators and control characters never belong in a folder name. */
const UNSAFE_NAME = /[/\\\u0000-\u001f]/;

/** @param {string} path @returns {boolean} */
const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory();

/**
 * Resolve the folder a request refers to and make sure it may be browsed.
 * @param {string} given - Path from the request; '' means the first browse root
 * @param {string[]} roots - Existing browse roots
 * @returns {string} Absolute path of an existing, browsable directory
 * @throws {HttpError} 403 outside the roots, 404 when missing or not a directory
 */
function browsableDir(given, roots) {
  if (!given && !roots.length) throw new HttpError(404, 'None of the browse roots exist');
  const dir = resolve(given || roots[0]);
  if (!isBrowsablePath(dir)) {
    throw new HttpError(403, 'Path is outside the folders this server may browse');
  }
  if (!isDirectory(dir)) throw new HttpError(404, 'Folder not found');
  return dir;
}

/**
 * Sub-directories of a folder that the browser may show and enter: no
 * dot-folders, and no symlinks that lead outside the browse roots.
 * @param {string} dir
 * @returns {{ name: string, path: string, hasProject: boolean }[]}
 */
function listDirs(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (!isAccessDenied(err)) throw err;
    throw new HttpError(403, 'The server is not allowed to read this folder');
  }
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ entry, path: join(dir, entry.name) }))
    .filter(({ entry, path }) =>
      entry.isSymbolicLink() ? isDirectory(path) && isBrowsablePath(path) : entry.isDirectory(),
    )
    .map(({ entry, path }) => ({
      name: entry.name,
      path,
      hasProject: existsSync(projectFilePath(path)),
    }))
    .sort((a, b) => byName.compare(a.name, b.name));
}

/** GET /api/browse?path= — list the sub-directories of a folder inside the browse roots */
browseRouter.get('/browse', (req, res) => {
  const roots = getConfig().browseRoots.filter(isDirectory);
  const dir = browsableDir(stringParam(req.query.path), roots);
  const parent = dirname(dir);
  res.json({
    path: dir,
    parent: parent !== dir && isBrowsablePath(parent) ? parent : null,
    roots,
    hasProject: existsSync(projectFilePath(dir)),
    dirs: listDirs(dir),
  });
});

/** POST /api/browse/mkdir — `{ path, name }` creates a folder inside a browsable one */
browseRouter.post('/browse/mkdir', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof body.path !== 'string' || !body.path) assertValid({ path: 'path is required' });
  const parent = browsableDir(body.path, getConfig().browseRoots);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 255 || name.startsWith('.') || UNSAFE_NAME.test(name)) {
    assertValid({ name: 'A folder name without slashes, not starting with a dot, is required' });
  }
  const target = join(parent, name);
  if (existsSync(target))
    throw new HttpError(409, 'A file or folder with this name already exists');
  try {
    mkdirSync(target);
  } catch (err) {
    if (!isAccessDenied(err)) throw err;
    throw new HttpError(403, 'The server is not allowed to create a folder here');
  }
  res.status(201).json({ path: target });
});

browseRouter.use(errorHandler);
