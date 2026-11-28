/**
 * What went wrong with a stage of the cutout pipeline, said for the person
 * who asked for the cutout: which program it was, how it ended, and the
 * last thing it printed.
 * @module api/cutout/failure
 */

import { HttpError } from '../lib/httpErrors.js';

/** A program that closed its output gets this long to exit by itself. */
const EXIT_GRACE_MS = 3000;

/**
 * A promise, or `late` when it has not settled in time.
 * @template T, L
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {L} late
 * @returns {Promise<T|L>}
 */
export function within(promise, ms, late) {
  /** @type {NodeJS.Timeout|undefined} */
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(late), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Why a stage that should still be running is not: how it ended and what it
 * printed.
 * @param {import('./process.js').Stage} stage
 * @param {string} when - "after 12 of 90 frames"
 * @returns {Promise<HttpError>}
 */
export async function stageFailure(stage, when) {
  const code = await within(stage.exited, EXIT_GRACE_MS, undefined);
  const said = stage.said();
  if (stage.failedToStart())
    return new HttpError(503, `Cannot start ${stage.name} (${stage.child.spawnfile}): ${said}`);
  const how = code === undefined ? 'closed its output' : `stopped (exit code ${code})`;
  const text = `${stage.name} ${how} ${when}${said ? `: ${said}` : ''}`;
  return new HttpError(500, text[0].toUpperCase() + text.slice(1));
}
