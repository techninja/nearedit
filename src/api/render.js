/**
 * Render routes — thin: validation in render/request.js, planning in
 * render/segments.js and render/passes.js, the job in render/job.js.
 * Contract: docs/app-spec/API.md.
 * @module api/render
 */

import { Router } from 'express';
import { runJob } from './lib/jobRunner.js';
import { RenderError } from './render/errors.js';
import { runRender } from './render/job.js';
import { lastPass } from './render/passes.js';
import { listPresets } from './render/presets.js';
import { prepareRender } from './render/prepare.js';
import { parseRenderRequest } from './render/request.js';
import { engineChoice } from './render/route.js';
import { renderSegments } from './render/segments.js';
import {
  deleteRender,
  isRenderName,
  listRenders,
  rendersDir,
  resolveRender,
} from './render/store.js';

export const renderRouter = Router();

/**
 * Answer a failed request: expected problems keep their status, the rest are 500.
 * @param {import('express').Response} res
 * @param {any} err
 */
function fail(res, err) {
  if (err instanceof RenderError) return res.status(err.status).json(err.toJSON());
  console.error('[render]', err);
  res.status(500).json({ error: 'Render failed', detail: err.message });
}

/** GET /api/render/presets — the selectable quality presets */
renderRouter.get('/render/presets', (_req, res) => {
  res.json({ data: listPresets() });
});

/** POST /api/render — start a render job */
renderRouter.post('/render', (req, res) => {
  try {
    const request = parseRenderRequest(req.body);
    // Planning the segments also refuses what the chosen renderer cannot draw.
    renderSegments(request.edl, request);
    const { projectId, adaptationId, preset, range, filename } = request;
    const job = runJob(
      'render',
      { projectId, adaptationId, preset, range, filename },
      { projectId, label: `Render: ${request.name || 'timeline'}`, lane: 'render' },
      (ctx) => runRender(request, ctx),
    );
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * POST /api/render/plan — what a render would run, without running it: the
 * segments with the renderer each takes, and the arguments of the last pass
 */
renderRouter.post('/render/plan', async (req, res) => {
  try {
    const request = parseRenderRequest(req.body);
    const { preset, range } = request;
    const segments = renderSegments(request.edl, { preset, range });
    const { probes, capabilities } = await prepareRender(request.edl);
    const plan = lastPass(request.edl, { probes, capabilities, preset, range }, segments);
    const { args, filterComplex, duration, inputs, warnings, width, height, fps } = plan;
    // An envelope's control track is binary: say how big it is instead.
    const files = plan.files.map(({ path, content }) => ({
      path,
      content: typeof content === 'string' ? content : `<${content.length} bytes>`,
    }));
    res.json({
      ...{ args, filterComplex, duration, inputs, files, warnings, width, height, fps },
      ...{ segments, engine: engineChoice() },
    });
  } catch (err) {
    fail(res, err);
  }
});

/** GET /api/renders?projectId= — finished renders, newest first */
renderRouter.get('/renders', (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  const data = listRenders(projectId);
  res.json({ data, total: data.length });
});

/** GET /api/render/file/:name — stream (HTTP range) or `?download` a render */
renderRouter.get('/render/file/:name', (req, res) => {
  const { name } = req.params;
  if (!isRenderName(name)) return res.status(400).json({ error: 'Invalid render name' });
  if (!resolveRender(name)) return res.status(404).json({ error: 'Render not found' });
  const options = { root: rendersDir(), dotfiles: /** @type {'deny'} */ ('deny') };
  const done = (err) => {
    if (err && !res.headersSent) fail(res, err);
  };
  if (req.query.download !== undefined) return res.download(name, name, options, done);
  res.sendFile(name, options, done);
});

/** DELETE /api/render/file/:name — delete a finished render and its record */
renderRouter.delete('/render/file/:name', (req, res) => {
  if (!isRenderName(req.params.name)) return res.status(400).json({ error: 'Invalid render name' });
  if (!deleteRender(req.params.name)) return res.status(404).json({ error: 'Render not found' });
  res.status(204).end();
});
