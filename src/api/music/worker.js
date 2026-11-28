/**
 * The music render worker — a thread that renders one song into one file:
 * the WAV header, then the samples second by second as the engine makes
 * them, so the server's own thread stays free and a long song never sits
 * in memory. It tells its parent how far it is; ending it (`terminate`)
 * stops the render wherever it is.
 * @module api/music/worker
 */

import { closeSync, openSync, writeSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { createRenderer } from '#utils/music/engine/renderer.js';
import { pcm16, wavHeader } from '#utils/music/wav.js';

/** Frames rendered between two progress messages: a second of sound. */
const CHUNK = 48000;

/**
 * @param {number} fd
 * @param {Uint8Array} bytes - Written whole, however many calls that takes
 */
function writeAll(fd, bytes) {
  for (let at = 0; at < bytes.length; ) at += writeSync(fd, bytes, at, bytes.length - at);
}

/**
 * Render a song into a file.
 * @param {{ song: any, file: string }} job - `file` must not exist yet
 * @param {(message: object) => void} tell
 */
function render({ song, file }, tell) {
  const renderer = createRenderer(song);
  const { frames, sampleRate } = renderer;
  const fd = openSync(file, 'wx');
  try {
    writeAll(fd, wavHeader(frames, sampleRate));
    while (renderer.position < frames) {
      writeAll(fd, pcm16(renderer.render(CHUNK)));
      tell({ done: renderer.position, frames });
    }
  } finally {
    closeSync(fd);
  }
  tell({ finished: true, frames, sampleRate });
}

const port = /** @type {import('node:worker_threads').MessagePort} */ (parentPort);
render(workerData, (message) => port.postMessage(message));
