/**
 * The rendering of a song, made at most once: a file that is on disk is
 * returned at once, requests for one key at the same moment share one
 * render (`flights.js`), and no more than `MUSIC_RENDER_CONCURRENCY` songs
 * are rendered at a time — the rest wait their turn.
 * Contract: MUSIC.md § Server and command line.
 * @module api/music/cache
 */

import { songKey } from '#utils/music/key.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { createLimiter } from '../lib/concurrency.js';
import { getConfig } from '../lib/config.js';
import { board, flightOf, takeOff } from './flights.js';
import { sweepPartials } from './partial.js';
import { aborted, renderSongFile } from './render.js';
import { musicDir, musicPath, readMusic } from './renderings.js';

/** @typedef {import('./renderings.js').Rendering} Rendering */

let slots = { limit: 0, run: createLimiter(1) };

/**
 * Run a render when one of the `MUSIC_RENDER_CONCURRENCY` places is free.
 * The setting is read when a render is asked for; a changed one counts for
 * the renders asked for after it.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function inTurn(task) {
  const limit = getConfig().jobs.musicConcurrency;
  if (slots.limit !== limit) slots = { limit, run: createLimiter(limit) };
  return slots.run(task);
}

/**
 * The rendering of a song: the one on disk, or a new one.
 * @param {{ folder: string, song: any, signal?: AbortSignal,
 *   onProgress?: (done: number, total: number) => void, timeoutMs?: number,
 *   workerFile?: string|URL }} options - `folder`: the project folder (or a
 *   document's): the file is `<folder>/.nearedit/music/<key>.wav`. `song`
 *   may be raw; it is normalised here. `signal` takes this caller out: the
 *   render itself stops when nobody else waits for the same song.
 *   `onProgress` counts frames. `timeoutMs` (default ten minutes; 0 = none)
 *   and `workerFile` are for the command line and tests
 * @returns {Promise<Rendering>} `cached` is false for everyone who waited
 *   for the render that made the file
 * @throws {Error} An `HttpError` with the reason (see `renderSongFile`), or
 *   an error with `killedBy: 'aborted'` when `signal` fired
 */
export async function renderMusic({ folder, song, signal, onProgress, ...limits }) {
  const normal = normalizeSong(song);
  const key = songKey(normal);
  const file = musicPath(folder, key);
  if (signal?.aborted) throw aborted();
  const known = readMusic(folder, key);
  if (known) return known;
  /** @type {(flight: import('./flights.js').Flight<Rendering>) => Promise<Rendering>} */
  const render = (flight) =>
    inTurn(async () => {
      if (flight.stop.signal.aborted) throw aborted();
      // Another process may have made it while this one waited for its turn.
      const made = readMusic(folder, key);
      if (made) return made;
      sweepPartials(musicDir(folder));
      flight.rendering = true;
      const hooks = { signal: flight.stop.signal, onProgress: flight.progress };
      const { duration } = await renderSongFile({
        song: normal,
        output: file,
        ...hooks,
        ...limits,
      });
      return { file, key, duration, cached: false };
    });
  return board(flightOf(file) || takeOff(file, render), signal, onProgress);
}
