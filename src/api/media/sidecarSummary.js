/**
 * The handful of sidecar facts a media listing needs, without re-reading
 * every sidecar on every request: a sidecar can hold a whole transcript, and
 * a big folder has thousands of them. Summaries are kept in memory keyed by
 * the sidecar's and the source's mtime, so they refresh as soon as either
 * file changes.
 * @module api/media/sidecarSummary
 */

import { statSync } from 'node:fs';
import { INDEX_VERSION, isStale, readSidecarRaw, sidecarPath } from '../lib/sidecar.js';

/**
 * @typedef {Object} SidecarSummary
 * @property {boolean} probed - The sidecar carries current probe data (duration, size, streams)
 * @property {number|null} duration
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} fps
 * @property {boolean|null} hasAudio
 * @property {number} rotation
 * @property {string[]} tags
 * @property {{ transcript: boolean, tags: boolean, beats: boolean, scenes: boolean,
 *   silences: boolean }} analysis
 */

const MAX_ENTRIES = 50_000;
/** @type {Map<string, { key: string, summary: SidecarSummary|null }>} */
const cache = new Map();

/** @param {unknown} value @returns {number|null} */
const numberOrNull = (value) => (Number.isFinite(value) ? /** @type {number} */ (value) : null);

/**
 * @param {import('../lib/sidecar.js').Sidecar & Record<string, any>} sidecar
 * @returns {SidecarSummary}
 */
function summarize(sidecar) {
  // A sidecar may exist without probe data (only user tags, or an older index
  // version); the listing then falls back to probing the file itself.
  const probed =
    sidecar._indexVersion === INDEX_VERSION &&
    (typeof sidecar.hasAudio === 'boolean' ||
      typeof sidecar.hasVideo === 'boolean' ||
      Number.isFinite(sidecar.duration) ||
      Number.isFinite(sidecar.width));
  return {
    probed,
    duration: numberOrNull(sidecar.duration),
    width: numberOrNull(sidecar.width),
    height: numberOrNull(sidecar.height),
    fps: numberOrNull(sidecar.fps),
    hasAudio: typeof sidecar.hasAudio === 'boolean' ? sidecar.hasAudio : null,
    rotation: numberOrNull(sidecar.rotation) || 0,
    tags: Array.isArray(sidecar.tags) ? sidecar.tags.filter((t) => typeof t === 'string') : [],
    analysis: {
      transcript: Array.isArray(sidecar.transcript),
      tags: Array.isArray(sidecar.tags) || Array.isArray(sidecar.keyframes),
      beats: Array.isArray(sidecar.beats),
      scenes: Array.isArray(sidecar.scenes),
      silences: Array.isArray(sidecar.silences),
    },
  };
}

/**
 * Summary of a media file's sidecar.
 * @param {string} mediaPath
 * @param {{ mtimeMs: number }} mediaStat - Stat of the media file
 * @returns {SidecarSummary|null} null when there is no sidecar or it is stale
 */
export function sidecarSummary(mediaPath, mediaStat) {
  const file = sidecarPath(mediaPath);
  let key;
  try {
    const st = statSync(file);
    key = `${st.mtimeMs}:${st.size}:${mediaStat.mtimeMs}`;
  } catch {
    cache.delete(file);
    return null; // no sidecar: the file has not been indexed
  }
  const hit = cache.get(file);
  if (hit?.key === key) return hit.summary;
  const raw = readSidecarRaw(mediaPath);
  const summary = raw && !isStale(mediaPath, raw) ? summarize(raw) : null;
  cache.delete(file);
  cache.set(file, { key, summary });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return summary;
}
