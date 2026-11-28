/**
 * Path safety — the server only touches files inside known roots.
 *
 * Allowed roots: every registered project directory and its mediaFolders,
 * global media paths, the dev media directory, the server data directory
 * and the library of brand kits (whose logos and fonts are media too).
 * Anything else (including `..` traversal out of a root) is refused, so the
 * media endpoints cannot be used to read arbitrary files off the host.
 *
 * @module api/lib/paths
 */

import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { getConfig } from './config.js';
import { mediaFoldersOf } from './mediaFolders.js';
import { loadRegistry } from './registry.js';

/**
 * True when `child` is `parent` or lives underneath it.
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
export function isInside(parent, child) {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/**
 * Resolve symlinks so a link cannot escape a root. A path that does not
 * exist yet (a folder about to be created) is resolved through its deepest
 * existing ancestor, so a symlinked parent cannot smuggle it out either.
 * @param {string} path
 * @returns {string}
 */
function real(path) {
  const abs = resolve(path);
  let existing = abs;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return abs;
    existing = parent;
  }
  try {
    return join(realpathSync(existing), relative(existing, abs));
  } catch {
    return abs; // vanished or unreadable between the two calls: nothing to follow
  }
}

/** @returns {string[]} Every directory the server may read media from. */
export function allowedRoots() {
  const cfg = getConfig();
  // The kit library is inside the data directory unless NEAREDIT_KITS_DIR moves it.
  const roots = new Set([cfg.devMediaDir, cfg.dataDir, cfg.kitsDir, ...cfg.globalMediaPaths]);
  for (const entry of Object.values(loadRegistry())) {
    if (typeof entry?.path !== 'string' || !entry.path) continue;
    roots.add(resolve(entry.path));
    for (const folder of mediaFoldersOf(entry.path)) roots.add(folder);
  }
  return [...roots];
}

/**
 * @param {unknown} filePath
 * @returns {boolean}
 */
export function isAllowedPath(filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) return false;
  const target = real(filePath);
  return allowedRoots().some((root) => isInside(real(root), target));
}

/**
 * True when a directory may be listed by the folder browser.
 * @param {unknown} dirPath
 * @returns {boolean}
 */
export function isBrowsablePath(dirPath) {
  if (typeof dirPath !== 'string' || !dirPath || dirPath.includes('\0')) return false;
  const target = real(dirPath);
  return getConfig().browseRoots.some((root) => isInside(real(root), target));
}

/**
 * Validate a media path taken from a request.
 * @param {unknown} filePath
 * @param {{ mustExist?: boolean }} [opts]
 * @returns {{ ok: true, path: string } | { ok: false, status: number, error: string }}
 */
export function checkMediaPath(filePath, opts = {}) {
  const { mustExist = true } = opts;
  if (typeof filePath !== 'string' || !filePath) {
    return { ok: false, status: 400, error: 'path required' };
  }
  if (!isAllowedPath(filePath)) {
    return { ok: false, status: 403, error: 'Path is outside the allowed media folders' };
  }
  const path = resolve(filePath);
  if (mustExist && !existsSync(path)) return { ok: false, status: 404, error: 'File not found' };
  return { ok: true, path };
}

/**
 * Express middleware factory: validates a path from the query string or
 * JSON body and stores the resolved value on `res.locals.mediaPath`.
 * @param {string} [key='path'] - Query/body field holding the path
 * @param {{ mustExist?: boolean }} [opts]
 * @returns {import('express').RequestHandler}
 */
export function requireMediaPath(key = 'path', opts = {}) {
  return (req, res, next) => {
    const result = checkMediaPath(req.query?.[key] ?? req.body?.[key], opts);
    if (result.ok === false) return res.status(result.status).json({ error: result.error });
    res.locals.mediaPath = result.path;
    next();
  };
}
