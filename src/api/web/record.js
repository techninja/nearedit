/**
 * Recording a recipe: open a studio, load the page, then for every frame of
 * the score let the performer prepare it, advance the clock by one frame,
 * take the picture and hand it to FFmpeg. The recording is written under a
 * temporary name and moved into place only when it is complete, with its
 * track beside it; a recording that fails or is cancelled leaves nothing.
 * Reference: WEBCLIP.md § Recording.
 * @module api/web/record
 */

import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileScore } from '#utils/web/index.js';
import { writeJsonAtomic } from '../lib/registry.js';
import { pngSize, startEncoder } from './encoder.js';
import { ProtocolError, WebError, aborted } from './errors.js';
import { createPerformer } from './performer.js';
import { openStudio } from './studio.js';

/**
 * @typedef {import('./studio.js').StudioOptions & { output: string, trackPath: string,
 *   key: string, signal?: AbortSignal,
 *   onFrame?: (done: number, total: number) => void }} RecordOptions
 */

const ACK_WAIT = 250;
/** Longer than any recording runs: a `.part` file this old belongs to nobody. */
const STALE_MS = 60 * 60_000;
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Remove what a process that was killed outright left half-written here.
 * @param {string} dir
 */
function sweepParts(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      if (name.endsWith('.part') && Date.now() - statSync(path).mtimeMs > STALE_MS)
        rmSync(path, { force: true });
    } catch (err) {
      console.warn(`[web] cannot clean ${path}: ${err.message}`);
    }
  }
}

/**
 * Say what a low-level failure means for the person who asked.
 * @param {any} err
 * @param {AbortSignal} [signal]
 * @returns {Error}
 */
export function explain(err, signal) {
  if (signal?.aborted) return aborted();
  if (!(err instanceof ProtocolError)) return err;
  if (err.closed)
    return new WebError(500, 'The browser stopped while recording (it crashed or was closed)');
  if (err.timedOut) return new WebError(504, `The page stopped responding (${err.method})`);
  return new WebError(500, `The browser refused a command: ${err.message}`);
}

/**
 * Record a recipe to a file.
 * @param {RecordOptions} options - `recipe` normalised; `output` and `trackPath` absolute
 * @returns {Promise<import('#utils/web/types.js').Track>}
 * @throws {Error} A `WebError` saying why, or — when the signal fired — an
 *   error with `killedBy: 'aborted'`. Nothing is left on disk or running
 */
export async function recordRecipe(options) {
  const { recipe, fps, output, trackPath, key, signal, onFrame } = options;
  const score = compileScore(recipe, fps);
  const partial = `${output}.${process.pid}-${Date.now().toString(36)}.part`;
  mkdirSync(dirname(output), { recursive: true });
  sweepParts(dirname(output));
  if (signal?.aborted) throw aborted();
  /** @type {ReturnType<typeof startEncoder>|null} */
  let encoder = null;
  /** @type {import('./studio.js').Studio|null} */
  let studio = null;
  // Cancelling ends the browser: whatever is waiting on it fails at once.
  const stop = () => void studio?.close();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    studio = await openStudio(options);
    if (signal?.aborted) throw aborted();
    const { tab, stepper } = studio;
    const performer = createPerformer({
      tab,
      stepper,
      recipe,
      score,
      load: studio.load,
      warn: studio.warn,
    });
    await studio.load(recipe.url, performer.rest);
    const { title } = await tab.call('pageFacts');
    let size = { width: 0, height: 0 };
    for (let n = 0; n < score.frames; n++) {
      if (signal?.aborted) throw aborted();
      studio.check();
      const { sent, discrete } = await performer.frame(n);
      const png = Buffer.from(await stepper.frame(true, discrete), 'base64');
      // Mouse events are answered once the frame is drawn; none is worth waiting long for.
      await Promise.race([Promise.allSettled(sent), sleep(ACK_WAIT)]);
      if (!encoder) {
        size = pngSize(png);
        encoder = startEncoder({ fps: score.fps, output: partial });
      }
      await encoder.write(png);
      onFrame?.(n + 1, score.frames);
    }
    await encoder?.finish();
    const even = (/** @type {number} */ side) => side - (side % 2);
    /** @type {import('#utils/web/types.js').Track} */
    const track = {
      ...{ version: 1, key, url: recipe.url, title, fps: score.fps, duration: score.duration },
      ...{ viewport: recipe.viewport, scale: recipe.scale },
      ...{ width: even(size.width), height: even(size.height) },
      ...performer.track(),
      warnings: studio.warnings(),
    };
    renameSync(partial, output);
    writeJsonAtomic(trackPath, track);
    return track;
  } catch (err) {
    await encoder?.kill();
    rmSync(partial, { force: true });
    throw explain(err, signal);
  } finally {
    signal?.removeEventListener('abort', stop);
    await studio?.close();
  }
}
