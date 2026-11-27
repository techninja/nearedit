/**
 * Shared pieces of picture previews (filmstrips and single frames): the
 * ffmpeg arguments both use, a limiter so a media bin full of thumbnails does
 * not start a hundred ffmpeg processes, and the mapping from a failed ffmpeg
 * run to an HTTP error.
 * @module api/previews/pictures
 */

import { availableParallelism } from 'node:os';
import { createLimiter } from '../lib/concurrency.js';
import { HttpError } from '../lib/httpErrors.js';
import { mediaType } from '../lib/mediaScan.js';
import { cachedProbe } from '../lib/probeCache.js';

/** Quiet, and never waiting on stdin. */
export const FFMPEG_BASE = ['-v', 'error', '-nostdin'];

/** At most this many preview ffmpeg processes at once. */
export const pictureLimit = createLimiter(Math.max(2, Math.min(4, availableParallelism())));

/**
 * Scale filter for a target height. The width follows the display aspect
 * ratio (so anamorphic sources are not squashed) and is kept even.
 * @param {number|string} height - Pixels, or an ffmpeg expression
 * @returns {string}
 */
export function scaleFilter(height) {
  return `scale=w=trunc(oh*dar/2)*2:h=${height},setsar=1`;
}

/**
 * What kind of picture a file holds, and how long it runs.
 * @param {string} sourcePath
 * @param {{ mtimeMs: number, size: number }} sourceStat
 * @returns {Promise<{ still: boolean, duration: number, fps: number }>} `still` for images
 *   and for video files without a usable duration
 * @throws {HttpError} 422 when the file has no picture
 */
export async function describePicture(sourcePath, sourceStat) {
  const type = mediaType(sourcePath);
  if (type !== 'video' && type !== 'image') {
    throw new HttpError(422, 'This file has no picture to preview');
  }
  const info = await cachedProbe(sourcePath, sourceStat);
  if (!info) throw new HttpError(422, 'This file cannot be read as media');
  if (!info.hasVideo) throw new HttpError(422, 'This file has no picture to preview');
  const duration = type === 'video' && info.duration > 0 ? info.duration : 0;
  return { still: duration === 0, duration, fps: info.fps > 0 ? info.fps : 30 };
}

/**
 * Turn a failed preview run into the error the client should see. A file
 * ffmpeg cannot decode is the caller's problem (422); a missing ffmpeg is
 * the server's (500).
 * @param {any} err
 * @param {string} message - What was being attempted
 * @returns {Error}
 */
export function pictureError(err, message) {
  if (err instanceof HttpError) return err;
  if (err?.code === 'ENOENT') return new Error('ffmpeg is not installed or not on the PATH');
  const detail = String(err?.message || err)
    .split('\n')
    .slice(-2)
    .join(' ')
    .slice(0, 400);
  return new HttpError(422, message, { detail });
}
