/**
 * Filmstrip thumbnails — one JPEG holding `cols` frames side by side, spread
 * evenly over a clip. Cached in `<dataDir>/previews`, keyed by source path +
 * mtime + geometry.
 *
 * Videos are sampled by seeking (one fast seek per frame) rather than by
 * decoding the whole file, which keeps an hour-long clip as quick as a short
 * one. Stills are scaled once and repeated.
 * @module api/previews/thumbnail
 */

import { existsSync } from 'node:fs';
import { createSingleFlight } from '../lib/concurrency.js';
import { getConfig } from '../lib/config.js';
import { run } from '../lib/ffmpeg.js';
import { cacheEntry, produceCacheFile } from '../lib/fileCache.js';
import {
  FFMPEG_BASE,
  describePicture,
  pictureError,
  pictureLimit,
  scaleFilter,
} from './pictures.js';

export const THUMB_LIMITS = { cols: [1, 40], height: [16, 360] };
const JPEG_OUT = ['-map', '[out]', '-frames:v', '1', '-update', '1', '-q:v', '4'];
const SEEK_TIMEOUT_MS = 60_000;
const DECODE_TIMEOUT_MS = 5 * 60_000;

const flights = createSingleFlight();

/**
 * @param {number} cols
 * @returns {string} "[c0][c1]…" — one label per cell
 */
function cellLabels(cols) {
  return Array.from({ length: cols }, (_, i) => `[c${i}]`).join('');
}

/**
 * One seek per cell, at the middle of each of `cols` equal segments.
 * @param {string} source
 * @param {number} duration
 * @param {number} cols
 * @param {number} height
 * @returns {string[]} ffmpeg arguments up to (not including) the output path
 */
function seekArgs(source, duration, cols, height) {
  const inputs = [];
  const chains = [];
  for (let i = 0; i < cols; i++) {
    inputs.push('-ss', (((i + 0.5) / cols) * duration).toFixed(3), '-i', source);
    chains.push(`[${i}:v:0]${scaleFilter(height)}[c${i}]`);
  }
  const graph = `${chains.join(';')};${cellLabels(cols)}hstack=inputs=${cols}[out]`;
  const single = `[0:v:0]${scaleFilter(height)}[out]`;
  return [...FFMPEG_BASE, ...inputs, '-filter_complex', cols === 1 ? single : graph, ...JPEG_OUT];
}

/**
 * Decode the file from start to end and keep `cols` frames. Slow, but works
 * for files that cannot be seeked or whose picture ends before their sound.
 * @param {string} source
 * @param {number} duration
 * @param {number} cols
 * @param {number} height
 * @returns {string[]}
 */
function decodeArgs(source, duration, cols, height) {
  const graph = `[0:v:0]fps=${cols}/${duration.toFixed(3)},${scaleFilter(height)},tile=${cols}x1[out]`;
  return [...FFMPEG_BASE, '-i', source, '-filter_complex', graph, ...JPEG_OUT];
}

/**
 * Scale a still once and repeat it across the strip.
 * @param {string} source
 * @param {number} cols
 * @param {number} height
 * @returns {string[]}
 */
function stillArgs(source, cols, height) {
  const cells = cellLabels(cols);
  const repeated = `[0:v:0]${scaleFilter(height)},split=${cols}${cells};${cells}hstack=inputs=${cols}[out]`;
  const single = `[0:v:0]${scaleFilter(height)}[out]`;
  return [
    ...FFMPEG_BASE,
    '-i',
    source,
    '-filter_complex',
    cols === 1 ? single : repeated,
    ...JPEG_OUT,
  ];
}

/**
 * Return the cached filmstrip of a video or image, generating it if needed.
 * Concurrent requests for the same strip share one ffmpeg run.
 * @param {string} sourcePath - Absolute, already validated
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @param {{ cols: number, height: number }} geometry - Within THUMB_LIMITS
 * @returns {Promise<string>} Absolute path of the JPEG
 * @throws {import('../lib/httpErrors.js').HttpError} 422 when the file has no usable picture
 */
export async function filmstrip(sourcePath, sourceStat, geometry) {
  const cols = geometry.cols;
  const height = geometry.height - (geometry.height % 2);
  const dir = getConfig().previewsDir;
  const entry = cacheEntry(dir, 'thumb', sourcePath, sourceStat, `${cols}x${height}.jpg`);
  if (existsSync(entry.file)) return entry.file;

  return flights(entry.file, () =>
    pictureLimit(async () => {
      const picture = await describePicture(sourcePath, sourceStat);
      /** @type {{ args: string[], timeout: number }[]} */
      const attempts = picture.still
        ? [{ args: stillArgs(sourcePath, cols, height), timeout: SEEK_TIMEOUT_MS }]
        : [
            {
              args: seekArgs(sourcePath, picture.duration, cols, height),
              timeout: SEEK_TIMEOUT_MS,
            },
            {
              args: decodeArgs(sourcePath, picture.duration, cols, height),
              timeout: DECODE_TIMEOUT_MS,
            },
          ];
      let failure;
      for (const { args, timeout } of attempts) {
        try {
          return await produceCacheFile(entry, async (temp) => {
            await run('ffmpeg', [...args, '-y', temp], { timeout });
          });
        } catch (err) {
          failure = err;
        }
      }
      throw pictureError(failure, 'Could not make a thumbnail of this file');
    }),
  );
}
