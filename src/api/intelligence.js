/**
 * Intelligence routes — media analysis as background jobs. Logic lives in
 * ./intelligence/ (steps, providers, pipeline); results land in sidecars.
 * Contract: docs/app-spec/API.md § Intelligence.
 * @module api/intelligence
 */

import { Router } from 'express';
import { basename } from 'node:path';
import { readSidecar } from './lib/sidecar.js';
import { startBatchJob, startStepJob } from './intelligence/analyzeJob.js';
import { checkFile, parseAnalyzeRequest, parseStepRequest } from './intelligence/requests.js';
import { getSettings } from './intelligence/settings.js';
import { getStatus } from './intelligence/status.js';
import { getStep } from './intelligence/steps/index.js';
import { defaultDeps } from './intelligence/steps/types.js';
import { EXPORT_FORMATS, exportTranscript } from './intelligence/transcriptExport.js';

export const intelligenceRouter = Router();

/**
 * Answer a rejected request.
 * @param {import('express').Response} res
 * @param {import('./intelligence/requests.js').Rejection} rejection
 */
function refuse(res, rejection) {
  const { status, error, detail, fields } = rejection;
  res.status(status).json({ error, ...(detail && { detail }), ...(fields && { fields }) });
}

/** POST /api/intelligence/analyze — { projectId, paths?, steps?, force? } → 202 { jobId } */
intelligenceRouter.post('/intelligence/analyze', (req, res) => {
  const request = parseAnalyzeRequest(req.body || {});
  if (request.ok === false) return refuse(res, request);
  const job = startBatchJob({ type: 'analyze', ...request });
  res.status(202).json({ jobId: job.id });
});

/** Single-step routes: route segment → step name. */
const STEP_ROUTES = {
  transcribe: 'transcribe',
  tag: 'tags',
  beats: 'beats',
  scenes: 'scenes',
  silence: 'silence',
};

for (const [segment, stepName] of Object.entries(STEP_ROUTES)) {
  /** POST /api/intelligence/<segment> — { filePath, …options, force? } → 202 { jobId } */
  intelligenceRouter.post(`/intelligence/${segment}`, async (req, res) => {
    const step = getStep(stepName);
    const request = parseStepRequest(step, req.body || {});
    if (request.ok === false) return refuse(res, request);
    const sidecar = readSidecar(request.filePath);
    const reason = step.unsuitable(request.type, sidecar);
    if (reason) return res.status(400).json({ error: `${stepName}: ${reason}` });

    // Fail fast when the work needs a provider that is not there.
    if (step.available && (request.force || !step.done(sidecar, request.options))) {
      const ctx = { settings: getSettings(), deps: defaultDeps, cache: new Map() };
      const state = await step.available(ctx);
      if (!state.available) {
        const error = `No provider available for ${stepName}`;
        return res.status(503).json({ error, detail: state.reason || state.detail });
      }
    }
    const job = startStepJob(step, request);
    res.status(202).json({ jobId: job.id });
  });
}

/** GET /api/intelligence/status — which providers are configured and reachable */
intelligenceRouter.get('/intelligence/status', async (_req, res) => {
  res.json(await getStatus());
});

/** GET /api/intelligence/transcript?path=&format=json|srt|vtt|txt[&download=1] */
intelligenceRouter.get('/intelligence/transcript', (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (!Object.hasOwn(EXPORT_FORMATS, format)) {
    return res.status(400).json({ error: 'format must be json, srt, vtt or txt' });
  }
  const file = checkFile(req.query.path);
  if (file.ok === false) return refuse(res, file);
  const sidecar = readSidecar(file.path);
  if (!Array.isArray(sidecar?.transcript) && !sidecar?.segments?.length) {
    return res.status(404).json({ error: 'No transcript for this file' });
  }
  res.type(EXPORT_FORMATS[format]);
  if (req.query.download) res.attachment(`${basename(file.path)}.${format}`);
  res.send(exportTranscript(sidecar, format, file.path));
});
