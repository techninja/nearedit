/**
 * Music clip routes — thin: what a request must look like is in
 * music/request.js, the rendering in music/cache.js and music/render.js,
 * reading MIDI in music/midi.js.
 * Contract: docs/app-spec/MUSIC.md § Server and API.md § Music clips.
 * @module api/music
 */

import { Router } from 'express';
import { errorHandler } from './lib/httpErrors.js';
import { renderMusic } from './music/cache.js';
import { importMidi } from './music/midi.js';
import { parseImportRequest, parseRenderRequest } from './music/request.js';

export const musicRouter = Router();

/**
 * Answer with what the work gives. A client that goes away stops it, and
 * then there is nobody left to answer.
 * @param {import('express').Response} res
 * @param {(signal: AbortSignal) => Promise<object>} work
 */
async function answer(res, work) {
  const gone = new AbortController();
  res.on('close', () => res.writableFinished || gone.abort());
  try {
    res.json(await work(gone.signal));
  } catch (err) {
    if (!gone.signal.aborted) throw err;
  }
}

/**
 * POST /api/music/render — the rendering of a song in its project: the one
 * that is there, or a new one. Answers when the file exists; a client that
 * goes away stops its render unless someone else waits for the same song.
 */
musicRouter.post('/music/render', async (req, res) => {
  const { folder, song } = parseRenderRequest(req.body);
  await answer(res, (signal) => renderMusic({ folder, song, signal }));
});

/** POST /api/music/import — a MIDI file of the project as a song */
musicRouter.post('/music/import', async (req, res) => {
  const { file } = parseImportRequest(req.body);
  await answer(res, (signal) => importMidi(file, { signal }));
});

musicRouter.use(errorHandler);
