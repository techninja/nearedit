/**
 * Person cutout routes — thin: what a request must look like is in
 * cutout/request.js, the matte program in cutout/provider*.js, the work in
 * cutout/make.js and cutout/pipeline.js.
 * Contract: docs/app-spec/CUTOUT.md § Server and API.md § Person cutout.
 * @module api/cutout
 */

import { basename } from 'node:path';
import { Router } from 'express';
import { KEY_PATTERN } from '#utils/cutout/index.js';
import { readMeta } from './cutout/files.js';
import { runCutout } from './cutout/job.js';
import { cutoutStatus, requireProvider } from './cutout/providerStatus.js';
import { parseCutoutRequest } from './cutout/request.js';
import { HttpError } from './lib/httpErrors.js';
import { runJob } from './lib/jobRunner.js';
import { stringParam } from './lib/params.js';
import { getProjectDir } from './lib/registry.js';

export const cutoutRouter = Router();

/**
 * Answer a failed request. What was expected keeps its status and says its
 * reason — also a 503, which the shared handler would hide; the rest is a 500.
 * @param {import('express').Response} res
 * @param {any} err
 */
function fail(res, err) {
  if (!(err instanceof HttpError)) throw err;
  const { message: error, detail, fields } = err;
  res.status(err.status).json({ error, ...(detail && { detail }), ...(fields && { fields }) });
}

/** GET /api/cutout/status — is there a matte program, and if not, what is missing */
cutoutRouter.get('/cutout/status', async (req, res) => {
  res.json(await cutoutStatus({ fresh: req.query.fresh !== undefined }));
});

/** POST /api/cutout — start cutting the person out of a stretch of a media file */
cutoutRouter.post('/cutout', async (req, res) => {
  try {
    const request = await parseCutoutRequest(req.body);
    await requireProvider();
    const { projectId, path, start, end, fps } = request;
    const job = runJob(
      'cutout',
      { projectId, path, start, end, fps },
      { projectId, label: `Cut out: ${basename(path)}`, lane: 'cutout' },
      (ctx) => runCutout(request, ctx),
    );
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/cutout/meta?projectId=&key= — the description of a cutout file */
cutoutRouter.get('/cutout/meta', (req, res) => {
  const key = stringParam(req.query.key);
  if (!KEY_PATTERN.test(key)) throw new HttpError(400, 'key must be a cutout key');
  const folder = getProjectDir(stringParam(req.query.projectId));
  if (!folder) throw new HttpError(404, 'Project not found');
  const meta = readMeta(folder, key);
  if (!meta) throw new HttpError(404, 'No such cutout');
  res.json(meta);
});
