/**
 * Single preview frames. A frame is cheap to make and there is one for every
 * instant of every clip, so nothing is written to disk: the JPEG is produced
 * in memory, a small recent-frames cache absorbs repeats, and an ETag built
 * from path + mtime + time + height lets browsers revalidate for free.
 * @module api/previews/frame
 */

import { run } from '../lib/ffmpeg.js';
import { hash } from '../lib/fileCache.js';
import { HttpError } from '../lib/httpErrors.js';
import {
  FFMPEG_BASE,
  describePicture,
  pictureError,
  pictureLimit,
  scaleFilter,
} from './pictures.js';

export const FRAME_LIMITS = { height: [16, 2160], defaultHeight: 360 };
const MAX_RECENT = 100;
const TIMEOUT_MS = 30_000;

/** @type {Map<string, Buffer>} ETag → JPEG, oldest first */
const recent = new Map();

/**
 * The validator of one frame request. It changes whenever the source file is
 * edited, so a cached frame is never served for a different picture.
 * @param {string} sourcePath
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @param {{ time: number, height: number }} opts
 * @returns {string} A quoted ETag
 */
export function frameEtag(sourcePath, sourceStat, opts) {
  const parts = [
    sourcePath,
    sourceStat.mtimeMs,
    sourceStat.size,
    opts.time.toFixed(3),
    opts.height,
  ];
  return `"frame-${hash(parts.join('|'), 24)}"`;
}

/**
 * @param {string} etag
 * @param {Buffer} jpeg
 */
function remember(etag, jpeg) {
  recent.delete(etag);
  recent.set(etag, jpeg);
  if (recent.size > MAX_RECENT) recent.delete(recent.keys().next().value);
}

/**
 * Produce one JPEG frame of a video (at `time`) or of an image (scaled).
 * The picture is never enlarged beyond its source height.
 * @param {string} sourcePath - Absolute, already validated
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @param {{ time: number, height: number }} opts - `time` in seconds, `height` in pixels
 * @returns {Promise<Buffer>}
 * @throws {HttpError} 422 when the file has no picture or no frame at that time
 */
export async function frameJpeg(sourcePath, sourceStat, opts) {
  const etag = frameEtag(sourcePath, sourceStat, opts);
  const cached = recent.get(etag);
  if (cached) return cached;

  return pictureLimit(async () => {
    const picture = await describePicture(sourcePath, sourceStat);
    // Asking for the very end would land after the last frame; step back one.
    const lastFrame = Math.max(0, picture.duration - 1 / picture.fps);
    const seek = picture.still ? [] : ['-ss', Math.min(opts.time, lastFrame).toFixed(3)];
    const filter = scaleFilter(`min(${opts.height - (opts.height % 2)}\\,ih)`);
    const output = ['-an', '-frames:v', '1', '-vf', filter, '-q:v', '3', '-f', 'mjpeg', 'pipe:1'];
    let jpeg;
    try {
      const args = [...FFMPEG_BASE, ...seek, '-i', sourcePath, ...output];
      jpeg = (await run('ffmpeg', args, { binary: true, timeout: TIMEOUT_MS })).stdout;
    } catch (err) {
      throw pictureError(err, 'Could not read a frame from this file');
    }
    if (!jpeg.length) throw new HttpError(422, 'There is no frame at that time');
    remember(etag, jpeg);
    return jpeg;
  });
}
