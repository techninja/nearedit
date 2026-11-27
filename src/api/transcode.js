/**
 * Audio transcode route — serves a WAV rendition of compressed audio so the
 * browser can seek to the exact sample. Rendition logic and its cache live
 * in ./media/wavRendition.js. Contract: docs/app-spec/API.md § Media.
 * @module api/transcode
 */

import { Router } from 'express';
import { HttpError, errorHandler } from './lib/httpErrors.js';
import { sendFile } from './lib/sendFile.js';
import { requireMediaFile } from './media/guards.js';
import { ensureWav, needsWav } from './media/wavRendition.js';

export const transcodeRouter = Router();

/**
 * GET /api/transcode?path= — the WAV rendition of a compressed audio file
 * (made on first request, then cached). Files that need no rendition are
 * streamed as they are. Range requests are supported either way.
 */
transcodeRouter.get('/transcode', requireMediaFile(), async (_req, res) => {
  const { mediaPath, mediaStat } = res.locals;
  if (!needsWav(mediaPath)) return sendFile(res, mediaPath);
  let wav;
  try {
    wav = await ensureWav(mediaPath, mediaStat);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('ffmpeg is not installed or not on the PATH');
    const detail = String(err.message).split('\n').slice(-2).join(' ').slice(0, 400);
    throw new HttpError(422, 'The audio of this file could not be decoded', { detail });
  }
  sendFile(res, wav, { type: 'audio/wav' });
});

transcodeRouter.use(errorHandler);
