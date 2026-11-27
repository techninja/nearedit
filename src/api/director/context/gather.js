/**
 * Gather a project's media for the director: scan the media roots, read
 * each file's sidecar and probe whatever has not been analysed yet, so
 * un-indexed files still take part with what is known about them.
 * @module api/director/context/gather
 */

import { statSync } from 'node:fs';
import { probe } from '../../lib/ffmpeg.js';
import { scanProject } from '../../lib/mediaScan.js';
import { readSidecar } from '../../lib/sidecar.js';
import { toMediaInfo } from './mediaInfo.js';

/** @typedef {import('./mediaInfo.js').MediaInfo} MediaInfo */

const PROBE_CONCURRENCY = 4;
const MAX_CACHE = 2000;
/** @type {Map<string, Record<string, any>|null>} Probe results by path + mtime. */
const probeCache = new Map();

/**
 * Whether a sidecar already answers what the director needs from a probe.
 * @param {import('../../lib/mediaScan.js').MediaEntry} entry
 * @param {import('../../lib/sidecar.js').Sidecar|null} sidecar
 * @returns {boolean}
 */
function needsProbe(entry, sidecar) {
  if (!sidecar) return true;
  if (entry.type === 'image') return !sidecar.width && !(/** @type {any} */ (sidecar).resolution);
  if (!(Number(sidecar.duration) > 0)) return true;
  return entry.type === 'video' && typeof sidecar.hasAudio !== 'boolean';
}

/**
 * Probe a file, remembering the answer until the file changes.
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, any>|null>}
 */
async function cachedProbe(filePath, signal) {
  let key = filePath;
  try {
    key = `${filePath}:${statSync(filePath).mtimeMs}`;
  } catch {
    return null; // vanished between scan and probe
  }
  if (probeCache.has(key)) return probeCache.get(key);
  const result = await probe(filePath, { signal });
  if (signal?.aborted) return null;
  if (probeCache.size >= MAX_CACHE) probeCache.delete(probeCache.keys().next().value);
  probeCache.set(key, result);
  return result;
}

/**
 * Every video, audio and image file of a project as MediaInfo, in a stable
 * order (project files by path, then global files) with handles m1, m2 ….
 * @param {string} projectId
 * @param {{ signal?: AbortSignal, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<MediaInfo[]>}
 */
export async function gatherMedia(projectId, opts = {}) {
  const { signal, onProgress } = opts;
  const byPath = (a, b) =>
    Number(a.global) - Number(b.global) ||
    a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true });
  const entries = scanProject(projectId)
    .filter((e) => e.type !== 'text')
    .sort(byPath);
  /** @type {MediaInfo[]} */
  const infos = new Array(entries.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < entries.length) {
      const index = next++;
      const entry = entries[index];
      signal?.throwIfAborted();
      const sidecar = readSidecar(entry.filePath);
      const probed = needsProbe(entry, sidecar) ? await cachedProbe(entry.filePath, signal) : null;
      infos[index] = toMediaInfo(entry, sidecar, probed);
      onProgress?.(++done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  signal?.throwIfAborted();
  infos.forEach((info, i) => (info.handle = `m${i + 1}`));
  return infos;
}

/**
 * Look a file up by absolute path.
 * @param {MediaInfo[]} media
 * @param {string} filePath
 * @returns {MediaInfo|undefined}
 */
export function findByPath(media, filePath) {
  return media.find((m) => m.filePath === filePath);
}
