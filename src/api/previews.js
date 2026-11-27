/**
 * Preview routes: filmstrip thumbnails, single frames and waveform peaks.
 * Contract: docs/app-spec/API.md § Media. Generation lives in ./previews/.
 * @module api/previews
 */

import { Router } from 'express';
import { errorHandler } from './lib/httpErrors.js';
import { intParam, numberParam } from './lib/params.js';
import { sendFile } from './lib/sendFile.js';
import { requireMediaFile } from './media/guards.js';
import { FRAME_LIMITS, frameEtag, frameJpeg } from './previews/frame.js';
import { THUMB_LIMITS, filmstrip } from './previews/thumbnail.js';
import { requestWaveform } from './previews/waveform.js';

export const previewsRouter = Router();

/** GET /api/previews/thumbnail?path=&cols=10&height=90 — JPEG filmstrip of `cols` frames */
previewsRouter.get('/previews/thumbnail', requireMediaFile(), async (req, res) => {
  const cols = intParam(req.query.cols, 10, THUMB_LIMITS.cols[0], THUMB_LIMITS.cols[1]);
  const height = intParam(req.query.height, 90, THUMB_LIMITS.height[0], THUMB_LIMITS.height[1]);
  const file = await filmstrip(res.locals.mediaPath, res.locals.mediaStat, { cols, height });
  sendFile(res, file, { type: 'image/jpeg' });
});

/** GET /api/previews/frame?path=&time=&height= — one JPEG frame */
previewsRouter.get('/previews/frame', requireMediaFile(), async (req, res) => {
  const [min, max] = FRAME_LIMITS.height;
  const opts = {
    time: numberParam(req.query.time, 0, 0, Number.MAX_SAFE_INTEGER),
    height: intParam(req.query.height, FRAME_LIMITS.defaultHeight, min, max),
  };
  res.set('ETag', frameEtag(res.locals.mediaPath, res.locals.mediaStat, opts));
  res.set('Cache-Control', 'private, no-cache');
  if (req.fresh) return res.status(304).end();
  const jpeg = await frameJpeg(res.locals.mediaPath, res.locals.mediaStat, opts);
  res.type('image/jpeg').send(jpeg);
});

/**
 * GET /api/previews/waveform?path= — 200 `{ peaks, samples, duration, peaksPerSecond }`
 * when cached, 202 `{ status: 'generating', jobId }` while a waveform job runs.
 */
previewsRouter.get('/previews/waveform', requireMediaFile(), async (req, res) => {
  const result = await requestWaveform(res.locals.mediaPath, res.locals.mediaStat);
  if ('file' in result) return sendFile(res, result.file, { type: 'application/json' });
  if ('data' in result) return res.json(result.data);
  res.status(202).json({ status: 'generating', jobId: result.jobId });
});

previewsRouter.use(errorHandler);
