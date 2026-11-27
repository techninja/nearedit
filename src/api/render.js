/**
 * Render routes — thin: validation in render/request.js, the graph in
 * render/plan.js, the job in render/job.js. Contract: docs/app-spec/API.md.
 * @module api/render
 */

import { Router } from 'express';
import { runJob } from './lib/jobRunner.js';
import { getCapabilities } from './render/capabilities.js';
import { RenderError } from './render/errors.js';
import { runRender } from './render/job.js';
import { buildRenderPlan, checkRenderable, renderSources } from './render/plan.js';
import { listPresets } from './render/presets.js';
import { probeSources } from './render/probe.js';
import { parseRenderRequest } from './render/request.js';
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
    checkRenderable(request.edl, request);
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

/** POST /api/render/plan — the FFmpeg arguments and graph, without running */
renderRouter.post('/render/plan', async (req, res) => {
  try {
    const request = parseRenderRequest(req.body);
    checkRenderable(request.edl, request);
    const [probes, capabilities] = await Promise.all([
      probeSources(renderSources(request.edl)),
      getCapabilities(),
    ]);
    const { preset, range } = request;
    const plan = buildRenderPlan(request.edl, { probes, capabilities, preset, range });
    const { args, filterComplex, duration, inputs, files, warnings, width, height, fps } = plan;
    res.json({ args, filterComplex, duration, inputs, files, warnings, width, height, fps });
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
