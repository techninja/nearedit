/**
 * Recording from the command line: find the browser, read the storage file
 * a recipe names (only from the folders the command may read), show
 * progress on stderr, and stop cleanly on Ctrl-C. The recorder is the
 * server's own; nothing private is reached unless `--allow` or
 * `WEB_CAPTURE_ALLOW` names it.
 * @module bin/lib/webRecord
 */

import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { compileScore } from '#utils/web/index.js';
import { getConfig } from '../../src/api/lib/config.js';
import { isInside } from '../../src/api/lib/paths.js';
import { readStorage } from '../../src/api/web/storage.js';
import { browserStatus } from '../../src/api/web/status.js';
import { DocumentError } from './document.js';

/** @typedef {{ out: (line: string) => void, err: (line: string) => void }} Io */

/**
 * The storage file of a recipe, read.
 * @param {string} name - `recipe.storage`
 * @param {string[]} folders - Where the command may read: the recipe's or document's folder first
 * @returns {import('../../src/api/web/storage.js').Storage|null}
 * @throws {DocumentError} When it is missing or outside those folders
 */
export function cliStorage(name, folders) {
  if (!name) return null;
  const file = isAbsolute(name) ? name : resolve(folders[0], name);
  if (!existsSync(file)) throw new DocumentError(`storage file not found: ${name}`);
  const real = realpathSync(file);
  if (!folders.some((root) => isInside(root, real)))
    throw new DocumentError(`storage file ${name} is outside the folder of the recipe`);
  return readStorage(real);
}

/**
 * What every recording from the command line is given.
 * @param {string[]} [allow] - `--allow` values
 * @returns {Promise<{ browser: string, noSandbox: boolean, allow: string, setting: string }>}
 * @throws {DocumentError} With the reason, when there is no browser to record with
 */
export async function recordingSetup(allow = []) {
  const status = await browserStatus();
  if (!status.available) throw new DocumentError(`cannot record web pages: ${status.reason}`);
  const { web } = getConfig();
  const allowed = [web.allow, ...allow].filter(Boolean).join(',');
  return {
    browser: status.browser.path,
    noSandbox: web.noSandbox,
    allow: allowed,
    setting: '--allow',
  };
}

/**
 * Run one recording with progress on stderr; Ctrl-C cancels it.
 * @param {string} what - For the progress line: the page's address
 * @param {any} recipe
 * @param {number} fps
 * @param {(hooks: { signal: AbortSignal, onFrame: (done: number, total: number) => void }) => Promise<any>} run
 * @param {Io} io
 * @returns {Promise<any>} What `run` resolved to; null when it was cancelled
 */
export async function withProgress(what, recipe, fps, run, io) {
  const { frames, duration } = compileScore(recipe, fps);
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once('SIGINT', interrupt).once('SIGTERM', interrupt);
  const live = process.stderr.isTTY;
  io.err(`recording ${what} (${Number(duration.toFixed(2))} s, ${frames} frames)`);
  let shown = -1;
  const onFrame = (/** @type {number} */ done, /** @type {number} */ total) => {
    const tenth = Math.floor((done / total) * 10);
    if (live) process.stderr.write(`\rframe ${done} of ${total}`);
    else if (tenth > shown && tenth < 10) io.err(`frame ${done} of ${total}`);
    shown = tenth;
  };
  try {
    return await run({ signal: stop.signal, onFrame });
  } catch (err) {
    if (!stop.signal.aborted) throw err;
    io.err('recording cancelled');
    return null;
  } finally {
    if (live) process.stderr.write('\r\x1b[K');
    process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
  }
}
