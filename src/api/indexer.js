/**
 * Index routes — probe every media file of a project into its sidecar, and
 * search what has been indexed. Logic lives in ./intelligence/.
 * Contract: docs/app-spec/API.md § Intelligence and § Media.
 * @module api/indexer
 */

import { Router } from 'express';
import { getProjectDir } from './lib/registry.js';
import { startBatchJob } from './intelligence/analyzeJob.js';
import { parseAnalyzeRequest } from './intelligence/requests.js';
import { searchProject } from './intelligence/search.js';
import { probeStep } from './intelligence/steps/probe.js';

export const indexerRouter = Router();

/**
 * POST /api/index — { projectId, paths?, force? } → 202 { jobId }.
 * Alias of /intelligence/analyze with steps: ["probe"], as an `index` job.
 */
indexerRouter.post('/index', (req, res) => {
  const { projectId = req.query.projectId, paths, force } = req.body || {};
  const request = parseAnalyzeRequest({ projectId, paths, force });
  if (request.ok === false) {
    const { status, error, detail } = request;
    return res.status(status).json({ error, ...(detail && { detail }) });
  }
  const job = startBatchJob({ type: 'index', ...request, steps: [probeStep] });
  res.status(202).json({ jobId: job.id });
});

/**
 * GET /api/index/search?q=&projectId=&limit= — search filenames, tags,
 * descriptions, transcripts and text content.
 * `{ data: [{ filePath, filename, relativePath, type, duration, score, matchCount,
 *    matches: [{ field, text, start?, end?, time? }] }], total }`
 */
indexerRouter.get('/index/search', (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  if (projectId && !getProjectDir(projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit), 10) || 50));
  res.json(searchProject(projectId, query, { limit }));
});
