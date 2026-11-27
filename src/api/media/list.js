/**
 * Media listing — every media file of a project as a MediaItem (API.md).
 * Metadata comes from a fresh sidecar when the file has been indexed and
 * from a cached, concurrency-bounded ffprobe otherwise, so a big folder is
 * only ever expensive the first time it is listed.
 * @module api/media/list
 */

import { statSync } from 'node:fs';
import { HttpError } from '../lib/httpErrors.js';
import { scanProject } from '../lib/mediaScan.js';
import { cachedProbe } from '../lib/probeCache.js';
import { getProjectDir } from '../lib/registry.js';
import { sidecarSummary } from './sidecarSummary.js';

const NO_ANALYSIS = {
  transcript: false,
  tags: false,
  beats: false,
  scenes: false,
  silences: false,
};
const byPath = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * @typedef {Object} MediaItem
 * @property {string} filename
 * @property {string} filePath - Absolute path
 * @property {string} relativePath - Relative to the folder it was found under
 * @property {'video'|'audio'|'image'|'text'} type
 * @property {boolean} global - Found under a global media path
 * @property {number} size - Bytes
 * @property {number} mtime - Milliseconds; changes when the file is edited
 * @property {number|null} duration - Seconds; null for stills and text
 * @property {number|null} width - Null when the file has no picture
 * @property {number|null} height
 * @property {number|null} fps - Null unless the file is a video
 * @property {boolean} hasAudio
 * @property {number} rotation - Degrees the picture is rotated for display
 * @property {boolean} indexed - A fresh sidecar exists
 * @property {string[]} tags
 * @property {{ transcript: boolean, tags: boolean, beats: boolean, scenes: boolean,
 *   silences: boolean }} analysis - Which analysis results the sidecar holds
 */

/**
 * What a sidecar summary and a probe result have in common.
 * @typedef {{ duration?: number|null, width?: number|null, height?: number|null,
 *   fps?: number|null, hasAudio?: boolean|null, rotation?: number }} MediaFacts
 */

/**
 * @param {import('../lib/mediaScan.js').MediaEntry} entry
 * @returns {Promise<MediaItem|null>} null when the file vanished during the scan
 */
async function describe(entry) {
  let stat;
  try {
    stat = statSync(entry.filePath);
  } catch {
    return null; // deleted between the directory scan and now
  }
  const sidecar = sidecarSummary(entry.filePath, stat);
  const timed = entry.type === 'video' || entry.type === 'audio';
  const needsProbe = entry.type !== 'text' && !sidecar?.probed;
  /** @type {MediaFacts} */
  const meta = (needsProbe ? await cachedProbe(entry.filePath, stat) : sidecar) || {};
  const pictured = entry.type !== 'audio' && entry.type !== 'text';
  return {
    filename: entry.filename,
    filePath: entry.filePath,
    relativePath: entry.relativePath,
    type: entry.type,
    global: entry.global,
    size: stat.size,
    mtime: Math.round(stat.mtimeMs),
    duration: timed ? (meta.duration ?? null) : null,
    width: pictured ? (meta.width ?? null) : null,
    height: pictured ? (meta.height ?? null) : null,
    fps: entry.type === 'video' ? (meta.fps ?? null) : null,
    hasAudio: timed ? (meta.hasAudio ?? entry.type === 'audio') : false,
    rotation: pictured ? meta.rotation || 0 : 0,
    indexed: !!sidecar,
    tags: sidecar?.tags || [],
    analysis: sidecar?.analysis || { ...NO_ANALYSIS },
  };
}

/**
 * List a project's media (its folder, extra media folders and the global
 * media paths), sorted by relative path. Without a project id the dev media
 * folder is listed instead.
 * @param {string} projectId - '' for the dev media folder
 * @returns {Promise<MediaItem[]>}
 * @throws {HttpError} 404 when a project id is given but not registered
 */
export async function listMedia(projectId) {
  if (projectId && !getProjectDir(projectId)) throw new HttpError(404, 'Project not found');
  const items = await Promise.all(scanProject(projectId).map(describe));
  return items
    .filter((item) => item !== null)
    .sort((a, b) => byPath.compare(a.relativePath, b.relativePath));
}
