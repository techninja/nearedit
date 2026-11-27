/**
 * Project registry and project-file I/O.
 *
 *   <dataDir>/registry.json                — project id → { path, name }
 *   <project-dir>/.nearedit/project.json   — config + adaptations + EDLs
 *
 * @module api/lib/registry
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getConfig } from './config.js';

/**
 * Write JSON atomically (temp file + rename) so a crash never truncates it.
 * @param {string} filePath
 * @param {unknown} data
 */
export function writeJsonAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, filePath);
  } catch (err) {
    rmSync(tmp, { force: true }); // a failed write (full disk, bad target) leaves no debris
    throw err;
  }
}

/**
 * Read and parse a JSON file, or return a fallback when missing/corrupt.
 * @template T
 * @param {string} filePath
 * @param {T} fallback
 * @returns {T}
 */
export function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

/** @returns {Record<string, { path: string, name: string }>} */
export function loadRegistry() {
  return readJson(getConfig().registryPath, {});
}

/** @param {Record<string, { path: string, name: string }>} registry */
export function saveRegistry(registry) {
  writeJsonAtomic(getConfig().registryPath, registry);
}

/**
 * Absolute directory of a registered project.
 * @param {string} projectId
 * @returns {string|null}
 */
export function getProjectDir(projectId) {
  if (!projectId) return null;
  return loadRegistry()[projectId]?.path || null;
}

/**
 * Path of the project file inside a project directory.
 * @param {string} projectDir
 * @returns {string}
 */
export function projectFilePath(projectDir) {
  return resolve(projectDir, '.nearedit', 'project.json');
}

/**
 * Read a project file by directory.
 * @param {string} projectDir
 * @returns {any|null}
 */
export function readProjectAt(projectDir) {
  return readJson(projectFilePath(projectDir), null);
}

/**
 * Read a project by registry id.
 * @param {string} projectId
 * @returns {any|null}
 */
export function readProject(projectId) {
  const dir = getProjectDir(projectId);
  return dir ? readProjectAt(dir) : null;
}

/**
 * Write a project file by registry id.
 * @param {string} projectId
 * @param {object} data
 * @returns {boolean} false when the project is not registered
 */
export function writeProject(projectId, data) {
  const dir = getProjectDir(projectId);
  if (!dir) return false;
  writeJsonAtomic(projectFilePath(dir), data);
  return true;
}

/**
 * Find an adaptation inside a project.
 * @param {string} projectId
 * @param {string} [adaptationId] - Omit for the first (root) adaptation
 * @returns {any|null}
 */
export function getAdaptation(projectId, adaptationId) {
  const project = readProject(projectId);
  const list = project?.adaptations || [];
  return (adaptationId ? list.find((a) => a.id === adaptationId) : list[0]) || null;
}

/**
 * Directories scanned for a project's media: the project directory, its
 * extra mediaFolders, then global media paths. Falls back to the repo's
 * dev media directory when the project is unknown.
 * @param {string} [projectId]
 * @returns {{ dir: string, global: boolean }[]}
 */
export function getMediaRoots(projectId) {
  const cfg = getConfig();
  const dir = getProjectDir(projectId || '');
  const roots = [];
  if (dir) {
    roots.push({ dir, global: false });
    const extra = readProjectAt(dir)?.mediaFolders;
    for (const f of Array.isArray(extra) ? extra : []) {
      if (f && !roots.some((r) => r.dir === f)) roots.push({ dir: resolve(f), global: false });
    }
  } else {
    roots.push({ dir: cfg.devMediaDir, global: false });
  }
  for (const g of cfg.globalMediaPaths) {
    if (!roots.some((r) => r.dir === g)) roots.push({ dir: g, global: true });
  }
  return roots;
}
