/**
 * One piece of work in a worker thread of its own, so the server's thread
 * stays free whatever the work costs: run it to its end, pass on what it
 * says on the way, and stop it — on a signal, or when it takes too long.
 * @module api/music/thread
 */

import { Worker } from 'node:worker_threads';
import { HttpError } from '../lib/httpErrors.js';

/**
 * @typedef {Object} ThreadOptions
 * @property {string} name - What the thread is, for messages: "music renderer"
 * @property {AbortSignal} [signal] - Ends the thread
 * @property {number} [timeoutMs] - Wall time allowed; 0 = as long as it takes
 * @property {(ms: number) => Error} late - What to throw when that time is up
 * @property {(message: any) => void} [onMessage] - What the thread says before it finishes
 */

/** @returns {Error} What cancelled work throws, as `lib/ffmpeg.js` `run` does */
export const aborted = () =>
  Object.assign(new Error('music render cancelled'), { killedBy: 'aborted' });

/**
 * Run a worker script to its end.
 * @param {string|URL} script
 * @param {any} data - Its `workerData`
 * @param {ThreadOptions} options
 * @returns {Promise<any>} The message it sent with `finished: true`,
 *   delivered once the thread has gone (and with it its hold on any file)
 * @throws {Error} `late(ms)` when the time is up; a 500 `HttpError` when the
 *   thread throws or ends without finishing; when the signal fired, an
 *   error with `killedBy: 'aborted'`
 */
export function runThread(script, data, { name, signal, timeoutMs = 0, late, onMessage }) {
  if (signal?.aborted) return Promise.reject(aborted());
  const crashed = (/** @type {string} */ why) =>
    new HttpError(500, `The ${name} stopped unexpectedly (${why})`);
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData: data });
    /** @type {any} */
    let answer = null;
    /** @type {Error|null} */
    let failure = null;
    const stop = (/** @type {Error} */ why) => {
      failure ??= why;
      worker.terminate();
    };
    const onAbort = () => stop(aborted());
    signal?.addEventListener('abort', onAbort, { once: true });
    // A timer cannot wait longer than 2³¹ ms: more than that is no limit.
    const limited = timeoutMs > 0 && timeoutMs < 2 ** 31;
    const timer = limited ? setTimeout(() => stop(late(timeoutMs)), timeoutMs) : undefined;
    worker.on('message', (/** @type {any} */ message) => {
      if (message?.finished) answer = message;
      else onMessage?.(message);
    });
    worker.on('error', (err) => void (failure ??= crashed(err?.message || String(err))));
    worker.on('exit', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (failure || !answer) reject(failure || crashed(`exit code ${code}`));
      else resolve(answer);
    });
  });
}
