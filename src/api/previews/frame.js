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
/** How far back to look for the last frame when the requested time has none. */
const TAIL_SECONDS = 2;

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
    const time = Math.min(opts.time, picture.duration);
    const scale = scaleFilter(`min(${opts.height - (opts.height % 2)}\\,ih)`);
    /**
     * @param {string[]} seek - Input options placed before the source
     * @param {string} filter
     * @returns {Promise<Buffer>} Empty when ffmpeg found no frame
     */
    const grab = async (seek, filter) => {
      const output = ['-an', '-frames:v', '1', '-vf', filter, '-q:v', '3', '-f', 'mjpeg', 'pipe:1'];
      const args = [...FFMPEG_BASE, ...seek, '-i', sourcePath, ...output];
      return (await run('ffmpeg', args, { binary: true, timeout: TIMEOUT_MS })).stdout;
    };
    let jpeg;
    try {
      jpeg = await grab(picture.still ? [] : ['-ss', time.toFixed(3)], scale);
      if (!jpeg.length && !picture.still) {
        // Past the last frame: the picture often ends a little before the file
        // does (longer audio). Use the last frame within reach instead.
        const from = Math.max(0, time - TAIL_SECONDS).toFixed(3);
        jpeg = await grab(['-ss', from], `${scale},reverse`);
      }
    } catch (err) {
      throw pictureError(err, 'Could not read a frame from this file');
    }
    if (!jpeg.length) throw new HttpError(422, 'There is no frame at that time');
    remember(etag, jpeg);
    return jpeg;
  });
}
