/**
 * Media discovery — recursive scans of project and global media folders.
 * @module api/lib/mediaScan
 */

import { readdirSync } from 'node:fs';
import { extname, join, relative, basename } from 'node:path';
import { getMediaRoots } from './registry.js';
import { isSidecarFile } from './sidecar.js';

export const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'];
export const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'];
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
export const TEXT_EXTS = ['.md', '.txt', '.srt', '.vtt', '.ass'];
export const ALL_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS, ...TEXT_EXTS];
export const SKIP_DIRS = ['.nearedit', 'node_modules', '.git', '.Trash'];

/**
 * @typedef {Object} MediaEntry
 * @property {string} filename
 * @property {string} filePath - Absolute path
 * @property {string} relativePath - Relative to its scan root
 * @property {string} root - Scan root it was found under
 * @property {boolean} global - Found under a global media path
 * @property {'video'|'audio'|'image'|'text'} type
 */

/**
 * Classify a file by extension.
 * @param {string} filePath
 * @returns {'video'|'audio'|'image'|'text'|null}
 */
export function mediaType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (TEXT_EXTS.includes(ext)) return 'text';
  return null;
}

/**
 * Recursively collect media files under a directory.
 * @param {string} dir
 * @param {string} [root=dir]
 * @param {boolean} [global=false]
 * @param {MediaEntry[]} [results]
 * @returns {MediaEntry[]}
 */
export function scanDir(dir, root = dir, global = false, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // unreadable or missing folder: treat as empty
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(filePath, root, global, results);
      continue;
    }
    if (!entry.isFile() || isSidecarFile(filePath)) continue;
    const type = mediaType(filePath);
    if (!type) continue;
    results.push({
      filename: basename(filePath),
      filePath,
      relativePath: relative(root, filePath),
      root,
      global,
      type,
    });
  }
  return results;
}

/**
 * Scan every media root of a project (deduplicated by absolute path).
 * @param {string} [projectId]
 * @returns {MediaEntry[]}
 */
export function scanProject(projectId) {
  const seen = new Set();
  const all = [];
  for (const { dir, global } of getMediaRoots(projectId)) {
    for (const entry of scanDir(dir, dir, global)) {
      if (seen.has(entry.filePath)) continue;
      seen.add(entry.filePath);
      all.push(entry);
    }
  }
  return all;
}
