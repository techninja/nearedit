/**
 * The MIDI import worker — a thread that reads one MIDI file and turns it
 * into a song. A file is small, but what it holds is not bounded by its
 * size alone, so the work happens here and not on the server's thread.
 * @module api/music/midiWorker
 */

import { readFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { parseMidi, songFromMidi } from '#utils/music/midi/index.js';

const port = /** @type {import('node:worker_threads').MessagePort} */ (parentPort);
const midi = parseMidi(readFileSync(workerData.file));
// Without a MIDI header there is no song to speak of: `song` stays null.
port.postMessage({ finished: true, song: null, warnings: [], ...(midi && songFromMidi(midi)) });
