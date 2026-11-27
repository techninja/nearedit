/**
 * A project's extra media folders, read without re-parsing the project file
 * each time. Path checks run on every media request, and the project file
 * also holds whole EDLs, so it is only read again when it changed on disk.
 * @module api/lib/mediaFolders
 */

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectFilePath, readProjectAt } from './registry.js';

/** @type {Map<string, { key: string, folders: string[] }>} project file → its mediaFolders */
const folderCache = new Map();

/**
 * @param {string} projectDir - Absolute path of a project folder
 * @returns {string[]} Resolved absolute paths; empty when the project has none or cannot be read
 */
export function mediaFoldersOf(projectDir) {
  const file = projectFilePath(projectDir);
  let key;
  try {
    const st = statSync(file);
    key = `${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    folderCache.delete(file);
    return []; // no project file (yet): no extra folders
  }
  const hit = folderCache.get(file);
  if (hit?.key === key) return hit.folders;
  const extra = readProjectAt(projectDir)?.mediaFolders;
  const folders = (Array.isArray(extra) ? extra : [])
    .filter((f) => typeof f === 'string' && f)
    .map((f) => resolve(f));
  folderCache.set(file, { key, folders });
  return folders;
}
