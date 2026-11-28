/**
 * Rendering songs from the command line: what is being rendered and how far
 * it is on stderr, and a clean stop on Ctrl-C. The renderer is the server's
 * own; here it may take as long as the song needs.
 * @module bin/lib/musicRender
 */

import { songSeconds } from '#utils/music/timing.js';

/** @typedef {{ out: (line: string) => void, err: (line: string) => void }} Io */

/** A render that is over sooner than this says nothing more than that it started. */
const QUIET_MS = 1000;

/**
 * Run one render with progress on stderr; Ctrl-C cancels it.
 * @param {string} what - For the first line: the file, or the song's name
 * @param {any} song
 * @param {(hooks: { signal: AbortSignal, timeoutMs: number,
 *   onProgress: (done: number, total: number) => void }) => Promise<any>} run
 * @param {Io} io
 * @returns {Promise<any>} What `run` resolved to; null when it was cancelled
 */
export async function withProgress(what, song, run, io) {
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once('SIGINT', interrupt).once('SIGTERM', interrupt);
  const live = process.stderr.isTTY;
  const started = Date.now();
  io.err(`rendering ${what} (${Number(songSeconds(song).toFixed(2))} s of music)`);
  let shown = 0;
  const onProgress = (/** @type {number} */ done, /** @type {number} */ total) => {
    const tenth = Math.floor((done / total) * 10);
    const due = tenth > shown && tenth < 10 && Date.now() - started >= QUIET_MS;
    if (live) process.stderr.write(`\rmusic ${Math.floor((done / total) * 100)}%`);
    else if (due) io.err(`music ${tenth * 10}%`);
    shown = Math.max(shown, tenth);
  };
  try {
    // No time limit: whoever started it watches it, and can stop it.
    return await run({ signal: stop.signal, onProgress, timeoutMs: 0 });
  } catch (err) {
    if (!stop.signal.aborted) throw err;
    io.err('music render cancelled');
    return null;
  } finally {
    if (live) process.stderr.write('\r\x1b[K');
    process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
  }
}
