/**
 * Path safety — the server only touches files inside known roots.
 *
 * Allowed roots: every registered project directory and its mediaFolders,
 * global media paths, the dev media directory and the server data directory.
 * Anything else (including `..` traversal out of a root) is refused, so the
 * media endpoints cannot be used to read arbitrary files off the host.
 *
 * @module api/lib/paths
 */

import { existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { getConfig } from './config.js';
import { loadRegistry, readProjectAt } from './registry.js';

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
 * Resolve symlinks when the path exists, so a link cannot escape a root.
 * @param {string} path
 * @returns {string}
 */
function real(path) {
  const abs = resolve(path);
  return existsSync(abs) ? realpathSync(abs) : abs;
}

/** @returns {string[]} Every directory the server may read media from. */
export function allowedRoots() {
  const cfg = getConfig();
  const roots = new Set([cfg.devMediaDir, cfg.dataDir, ...cfg.globalMediaPaths]);
  for (const entry of Object.values(loadRegistry())) {
    if (!entry?.path) continue;
    roots.add(resolve(entry.path));
    const extra = readProjectAt(entry.path)?.mediaFolders;
    for (const f of Array.isArray(extra) ? extra : []) if (f) roots.add(resolve(f));
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
