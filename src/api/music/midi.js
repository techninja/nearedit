/**
 * A MIDI file as a song, read off the main thread (`midiWorker.js`): a few
 * at a time, each for a bounded time.
 * Contract: MUSIC.md § The engine (MIDI), API.md § Music clips.
 * @module api/music/midi
 */

import { createLimiter } from '../lib/concurrency.js';
import { HttpError } from '../lib/httpErrors.js';
import { runThread } from './thread.js';

const WORKER = new URL('./midiWorker.js', import.meta.url);
/** Largest MIDI file that is read: far more than any song holds. */
export const MIDI_MAX_BYTES = 5 * 1024 * 1024;
/** Wall time reading one file may take. */
export const MIDI_TIMEOUT_MS = 20_000;

const inTurn = createLimiter(2);

/**
 * @param {string} why
 * @returns {HttpError} 422, with the reason under `fields.path`
 */
export const notImported = (why) =>
  new HttpError(422, 'The file cannot be imported', { fields: { path: why } });

/**
 * Read a MIDI file and turn it into a song.
 * @param {string} file - Absolute path, already checked
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<{ song: import('#utils/music/types.js').Song, warnings: string[] }>}
 *   `warnings`: what could not be carried over
 * @throws {Error} A 422 `HttpError` for what is not a MIDI file or takes
 *   too long to read; an error with `killedBy: 'aborted'` when the signal fired
 */
export async function importMidi(file, opts = {}) {
  const { signal, timeoutMs = MIDI_TIMEOUT_MS } = opts;
  const late = (/** @type {number} */ ms) =>
    notImported(`The file holds too much to read: it was not a song after ${ms / 1000} s`);
  const thread = { name: 'MIDI reader', signal, timeoutMs, late };
  const { song, warnings } = await inTurn(() => runThread(WORKER, { file }, thread));
  if (!song) throw notImported('This is not a MIDI file: it has no MIDI header');
  return { song, warnings };
}
