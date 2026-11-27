/**
 * On-disk cache files derived from a source media file (thumbnails, waveform
 * peaks, WAV renditions). File names carry a hash of the source path and a
 * hash of its mtime + size, so an edited source gets a new cache entry and the
 * outdated ones are removed. Files are produced under a temporary name and
 * renamed into place, so a failed or interrupted run never leaves a partial
 * file where a reader could find it.
 * @module api/lib/fileCache
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const TEMP_MARKER = '.part-';
const ORPHAN_AGE_MS = 60 * 60 * 1000;
/** @type {Set<string>} Cache directories already prepared by this process. */
const prepared = new Set();

/**
 * @param {string} text
 * @param {number} [length=16]
 * @returns {string}
 */
export function hash(text, length = 16) {
  return createHash('sha1').update(text).digest('hex').slice(0, length);
}

/**
 * Create a cache directory on first use and clear temp files a crashed
 * process may have left there.
 * @param {string} dir
 */
function prepare(dir) {
  if (prepared.has(dir) && existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  prepared.add(dir);
  for (const name of readdirSync(dir)) {
    if (!name.includes(TEMP_MARKER)) continue;
    const file = join(dir, name);
    try {
      if (Date.now() - statSync(file).mtimeMs > ORPHAN_AGE_MS) rmSync(file, { force: true });
    } catch (err) {
      console.warn(`[cache] could not clear ${file}: ${err.message}`);
    }
  }
}

/**
 * @typedef {Object} CacheEntry
 * @property {string} dir - Cache directory
 * @property {string} file - Absolute path of the cache file
 * @property {string} family - Name prefix of every entry of this kind for this source
 * @property {string} current - Name prefix of the entries for the source as it is now
 */

/**
 * Describe the cache entry of one derived file.
 * @param {string} dir - Cache directory
 * @param {string} kind - Short prefix, e.g. 'thumb'
 * @param {string} sourcePath - Absolute source path
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @param {string} variant - Distinguishes renditions of one source, e.g. '10x90.jpg'
 * @returns {CacheEntry}
 */
export function cacheEntry(dir, kind, sourcePath, sourceStat, variant) {
  const family = `${kind}_${hash(sourcePath)}_`;
  const current = `${family}${hash(`${sourceStat.mtimeMs}:${sourceStat.size}`, 12)}_`;
  return { dir, family, current, file: join(dir, `${current}${variant}`) };
}

/**
 * Produce a cache file atomically. `produce` writes to the temp path it is
 * given; on success the temp file is renamed into place and entries for older
 * revisions of the same source are removed. On failure the temp file is
 * deleted and the error is rethrown.
 * @param {CacheEntry} entry
 * @param {(tempPath: string) => Promise<void> | void} produce
 * @returns {Promise<string>} The final path
 */
export async function produceCacheFile(entry, produce) {
  prepare(entry.dir);
  const temp = `${entry.file}${TEMP_MARKER}${randomBytes(4).toString('hex')}${extname(entry.file)}`;
  try {
    await produce(temp);
    if (!existsSync(temp) || statSync(temp).size === 0) throw new Error('No output was produced');
    renameSync(temp, entry.file);
  } finally {
    rmSync(temp, { force: true });
  }
  for (const name of readdirSync(entry.dir)) {
    // Drop entries made from an older revision of this source. Temp files
    // belong to a run that is still going and are left alone.
    const outdated = name.startsWith(entry.family) && !name.startsWith(entry.current);
    if (outdated && !name.includes(TEMP_MARKER)) rmSync(join(entry.dir, name), { force: true });
  }
  return entry.file;
}
