/**
 * Rendering a song to a file, off the main thread: a worker thread
 * (`worker.js`) writes the WAV under a temporary name, and the file is
 * moved into place only when it is complete. A render that is cancelled,
 * takes too long or crashes leaves nothing behind (`thread.js` runs it).
 * Contract: MUSIC.md § The engine (why it runs in a thread and can be stopped).
 * @module api/music/render
 */

import { accessSync, constants, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError, isAccessDenied } from '../lib/httpErrors.js';
import { partialPath } from './partial.js';
import { aborted, runThread } from './thread.js';

export { aborted };

const WORKER = new URL('./worker.js', import.meta.url);
/** Wall time one render may take: the engine's worst case is slower than real time. */
export const RENDER_TIMEOUT_MS = 10 * 60_000;

/**
 * @typedef {Object} RenderOptions
 * @property {any} song - Normalised by the engine
 * @property {string} output - Absolute path of the WAV; an existing file is replaced
 * @property {AbortSignal} [signal] - Stops the worker and removes the partial file
 * @property {(done: number, total: number) => void} [onProgress] - Frames
 *   rendered so far, about once per second of sound
 * @property {number} [timeoutMs] - Wall time allowed; 0 = as long as it takes
 * @property {string|URL} [workerFile] - Another worker script, for tests
 */

let live = 0;

/** @returns {number} Worker threads rendering right now, in this process */
export const activeMusicRenders = () => live;

/**
 * @param {number} ms
 * @returns {HttpError} 422: the song asks for more than can be rendered in time
 */
function tooHeavy(ms) {
  const limit = ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${ms / 1000} s`;
  return new HttpError(
    422,
    `The song is too heavy to render: it was not finished after ${limit}. ` +
      'Give it fewer parts, fewer notes at once or less unison.',
  );
}

/**
 * Make sure renderings can be written beside `output`.
 * @param {string} output
 * @throws {HttpError} 403 when the folder cannot be created or written to
 */
function prepareFolder(output) {
  const dir = dirname(output);
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (err) {
    if (!isAccessDenied(err)) throw err;
    throw new HttpError(403, `Music cannot be rendered into ${dir}: the folder is not writable`);
  }
}

/**
 * Render a song to a WAV file (16-bit PCM, 48 kHz, stereo: exactly the
 * engine's samples).
 * @param {RenderOptions} options
 * @returns {Promise<{ frames: number, sampleRate: number, duration: number }>}
 * @throws {Error} An `HttpError` saying why — too heavy (422), a crashed
 *   renderer (500), a folder that cannot be written (403) — or, when the
 *   signal fired, an error with `killedBy: 'aborted'`
 */
export async function renderSongFile(options) {
  const { song, output, signal, onProgress } = options;
  const { timeoutMs = RENDER_TIMEOUT_MS, workerFile = WORKER } = options;
  if (signal?.aborted) throw aborted();
  prepareFolder(output);
  const partial = partialPath(output);
  const onMessage = (/** @type {any} */ said) => onProgress?.(said.done, said.frames);
  const thread = { name: 'music renderer', signal, timeoutMs, late: tooHeavy, onMessage };
  live++;
  try {
    const { frames, sampleRate } = await runThread(workerFile, { song, file: partial }, thread);
    // The thread has gone, and with it its hold on the file: it can be moved into place.
    renameSync(partial, output);
    return { frames, sampleRate, duration: frames / sampleRate };
  } catch (err) {
    rmSync(partial, { force: true });
    throw err;
  } finally {
    live--;
  }
}
