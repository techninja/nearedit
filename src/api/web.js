/**
 * Web clip routes — thin: what a request must look like is in
 * web/request.js, the recording in web/record.js, the job in web/job.js.
 * Contract: docs/app-spec/WEBCLIP.md § Server and API.md § Web clips.
 * @module api/web
 */

import { Router } from 'express';
import { KEY_PATTERN } from '#utils/web/index.js';
import { createLimiter } from './lib/concurrency.js';
import { getConfig } from './lib/config.js';
import { runJob } from './lib/jobRunner.js';
import { stringParam } from './lib/params.js';
import { getProjectDir } from './lib/registry.js';
import { readRecording } from './web/cache.js';
import { WebError } from './web/errors.js';
import { runWebRecord } from './web/job.js';
import { parseRecordRequest, parseSnapshotRequest } from './web/request.js';
import { takeSnapshot } from './web/snapshot.js';
import { browserStatus, requireBrowser } from './web/status.js';

export const webRouter = Router();

/** A snapshot is a browser too: no more of them at once than recordings. */
const snapshots = createLimiter(2);

/**
 * Answer a failed request: expected problems keep their status, the rest are 500.
 * @param {import('express').Response} res
 * @param {any} err
 */
function fail(res, err) {
  if (err instanceof WebError) return res.status(err.status).json(err.toJSON());
  console.error('[web]', err);
  res.status(500).json({ error: 'Web capture failed', detail: err.message });
}

/** GET /api/web/status — is there a browser to record with, and what may it reach */
webRouter.get('/web/status', async (req, res) => {
  try {
    res.json(await browserStatus({ fresh: req.query.fresh !== undefined }));
  } catch (err) {
    fail(res, err);
  }
});

/** POST /api/web/snapshot — the page after the first steps, with what one can aim at */
webRouter.post('/web/snapshot', async (req, res) => {
  const gone = new AbortController();
  res.on('close', () => res.writableFinished || gone.abort());
  try {
    const { recipe, until, fps, storage } = parseSnapshotRequest(req.body);
    const browser = await requireBrowser();
    const { allow, noSandbox } = getConfig().web;
    const snapshot = await snapshots(() =>
      takeSnapshot({ recipe, until, fps, storage, browser, allow, noSandbox, signal: gone.signal }),
    );
    res.json(snapshot);
  } catch (err) {
    if (!gone.signal.aborted) fail(res, err);
  }
});

/** POST /api/web/record — start recording a recipe into its project */
webRouter.post('/web/record', async (req, res) => {
  try {
    const request = parseRecordRequest(req.body);
    await requireBrowser();
    const { projectId, recipe, fps } = request;
    const label = `Record: ${URL.canParse(recipe.url) ? new URL(recipe.url).host : recipe.url}`;
    const job = runJob(
      'web',
      { projectId, fps, url: recipe.url },
      { projectId, label, lane: 'web' },
      (ctx) => runWebRecord(request, ctx),
    );
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/web/track?projectId=&key= — the track of a recording */
webRouter.get('/web/track', (req, res) => {
  const key = stringParam(req.query.key);
  if (!KEY_PATTERN.test(key)) return res.status(400).json({ error: 'key must be a recording key' });
  const folder = getProjectDir(stringParam(req.query.projectId));
  if (!folder) return res.status(404).json({ error: 'Project not found' });
  const recording = readRecording(folder, key);
  if (!recording) return res.status(404).json({ error: 'No such recording' });
  res.json(recording.track);
});
