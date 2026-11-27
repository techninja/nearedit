/**
 * Media routes: listing, file streaming and sidecar metadata.
 * Contract: docs/app-spec/API.md § Media. Every route that takes a path
 * checks it against the allowed roots first (403 outside them).
 * @module api/media
 */

import { existsSync } from 'node:fs';
import { Router } from 'express';
import { HttpError, errorHandler } from './lib/httpErrors.js';
import { mediaType } from './lib/mediaScan.js';
import { stringParam } from './lib/params.js';
import { sendFile } from './lib/sendFile.js';
import { isSidecarFile, readSidecar, sidecarPath, updateSidecar } from './lib/sidecar.js';
import { requireMediaFile } from './media/guards.js';
import { listMedia } from './media/list.js';
import { cleanSidecarPatch } from './media/sidecarPatch.js';

export const mediaRouter = Router();

/** GET /api/media?projectId= — every media file of a project */
mediaRouter.get('/media', async (req, res) => {
  const data = await listMedia(stringParam(req.query.projectId));
  res.json({ data, total: data.length });
});

/** GET /api/media/file?path= — stream a file (HTTP range supported) */
mediaRouter.get('/media/file', requireMediaFile(), (_req, res) => {
  sendFile(res, res.locals.mediaPath);
});

/** GET /api/sidecar?path= — a media file's sidecar, or { exists: false } */
mediaRouter.get('/sidecar', requireMediaFile(), (_req, res) => {
  const mediaPath = res.locals.mediaPath;
  const sidecar = readSidecar(mediaPath);
  // `stale` tells a client that analysis exists but predates the last edit of the file.
  res.json(sidecar || { exists: false, stale: existsSync(sidecarPath(mediaPath)) });
});

/** PUT /api/sidecar?path= — merge a patch into the sidecar */
mediaRouter.put('/sidecar', requireMediaFile(), (req, res) => {
  const mediaPath = res.locals.mediaPath;
  if (isSidecarFile(mediaPath) || !mediaType(mediaPath)) {
    throw new HttpError(400, 'Sidecars can only be written for media files');
  }
  res.json(updateSidecar(mediaPath, cleanSidecarPatch(req.body)));
});

mediaRouter.use(errorHandler);
