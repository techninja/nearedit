/**
 * The cutout of a stretch of a media file, made at most once: one that is
 * on disk — under the same key, or a longer one that covers the stretch —
 * is returned at once; requests for one key at the same moment share one
 * run (`music/flights.js`); and no more than `CUTOUT_CONCURRENCY` run at a
 * time. A run that fails or is cancelled leaves no file and no process.
 * Contract: CUTOUT.md § The cutout file and § Server.
 * @module api/cutout/make
 */

import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { cutoutKey, frameRange } from '#utils/cutout/index.js';
import { createLimiter } from '../lib/concurrency.js';
import { getConfig } from '../lib/config.js';
import { probe } from '../lib/ffmpeg.js';
import { HttpError, isAccessDenied } from '../lib/httpErrors.js';
import { writeJsonAtomic } from '../lib/registry.js';
import { board, flightOf, takeOff } from '../music/flights.js';
import { probeSource } from '../render/probe.js';
import { META_VERSION, cutoutPaths, findCutout, readCutout, sourceOf } from './files.js';
import { partialPath, removeOnAbort, sweepPartials } from './partial.js';
import { aborted, runPipeline } from './pipeline.js';
import { planCutout } from './plan.js';
import { matteCommand } from './provider.js';
import { requireProvider } from './providerStatus.js';

/** @typedef {import('./files.js').Cutout} Cutout */

let slots = { limit: 0, run: createLimiter(1) };

/**
 * Run when one of the `CUTOUT_CONCURRENCY` places is free. The setting is
 * read when a cutout is asked for.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function inTurn(task) {
  const limit = getConfig().jobs.cutoutConcurrency;
  if (slots.limit !== limit) slots = { limit, run: createLimiter(limit) };
  return slots.run(task);
}

/**
 * Make sure the file that was written is the cutout that was planned.
 * @param {string} file
 * @param {{ width: number, height: number, frames: number, fps: number }} planned
 * @throws {HttpError} 500 when it is not
 */
async function verify(file, { width, height, frames, fps }) {
  const made = await probe(file);
  const length = Math.round((made?.duration || 0) * fps);
  if (made?.width === width * 2 && made.height === height && Math.abs(length - frames) <= 1) return;
  const got = made ? `${made.width} × ${made.height}, ${length} frames` : 'nothing readable';
  throw new HttpError(500, 'The cutout file did not come out whole', {
    detail: `expected ${width * 2} × ${height}, ${frames} frames; got ${got}`,
  });
}

/**
 * The cutout of a stretch of a media file: the one on disk, or a new one.
 * @param {Object} options
 * @param {string} options.folder - The project folder (or a document's): the
 *   file is `<folder>/.nearedit/cutout/<key>.mp4`
 * @param {string} options.path - The media file, absolute
 * @param {number} options.start - Seconds into it; put on the frame grid here
 * @param {number} options.end
 * @param {number} [options.fps] - Of the document the cutout is for (30)
 * @param {AbortSignal} [options.signal] - Takes this caller out: the run
 *   itself stops when nobody else waits for the same cutout
 * @param {(done: number, total: number) => void} [options.onProgress] - Frames
 * @param {number} [options.stallMs] - For tests
 * @returns {Promise<Cutout>} `cached` is false for everyone who waited for
 *   the run that made the file
 * @throws {Error} An `HttpError` with the reason — no matte program (503), a
 *   file without a picture (422), a stage that failed (500) — or an error
 *   with `killedBy: 'aborted'` when `signal` fired
 */
export async function makeCutout({ folder, path, start, end, fps, signal, onProgress, stallMs }) {
  if (signal?.aborted) throw aborted();
  const { provider, model } = await requireProvider();
  const source = sourceOf(path);
  if (!source) throw new HttpError(404, 'File not found', { detail: path });
  const range = frameRange(start, end, fps);
  const key = cutoutKey({ source, ...range, model });
  const { file, metaPath } = cutoutPaths(folder, key);
  const there = () => readCutout(folder, key) || findCutout(folder, source, { ...range, model });
  const known = there();
  if (known) return known;
  /** @type {(flight: import('../music/flights.js').Flight<Cutout>) => Promise<Cutout>} */
  const run = (flight) =>
    inTurn(async () => {
      if (flight.stop.signal.aborted) throw aborted();
      // Another run may have made it while this one waited for its turn.
      const made = there();
      if (made) return made;
      const probed = await probeSource(path, { signal: flight.stop.signal });
      if (!probed?.hasVideo) throw new HttpError(422, 'The file has no picture', { detail: path });
      const plan = planCutout({ file: path, probe: probed, ...range });
      const { width, height } = plan;
      const size = { width, height, frames: range.frames, fps: range.fps };
      const partial = partialPath(file);
      let moved = false;
      try {
        mkdirSync(dirname(file), { recursive: true });
        sweepPartials(dirname(file));
        flight.rendering = true;
        const running = runPipeline({
          ...{ decoder: plan.decoder, packer: plan.packer(partial) },
          matte: matteCommand(provider, size),
          ...{ frameBytes: plan.frameBytes, matteBytes: plan.matteBytes, frames: range.frames },
          ...{ file: path, signal: flight.stop.signal, onProgress: flight.progress, stallMs },
        });
        // After the pipeline's own listener, which ends the processes.
        await running.finally(removeOnAbort(partial, flight.stop.signal));
        await verify(partial, size);
        renameSync(partial, file);
        moved = true;
        const { start: from, end: to } = range;
        const meta = { version: META_VERSION, key, source, start: from, end: to, ...size, model };
        writeJsonAtomic(metaPath, meta);
        return { file, key, source: path, start: from, end: to, ...size, cached: false };
      } catch (err) {
        // A picture without its description is not a cutout: nothing stays.
        rmSync(moved ? file : partial, { force: true });
        if (isAccessDenied(err))
          throw new HttpError(403, 'The project folder cannot be written', { detail: file });
        throw err;
      }
    });
  return board(flightOf(file) || takeOff(file, run), signal, onProgress);
}
