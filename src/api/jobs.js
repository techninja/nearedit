/**
 * Jobs REST routes. Queue logic lives in lib/jobs.js and lib/jobRunner.js.
 * @module api/jobs
 */

import { Router } from 'express';
import { getJob, listJobs, summarize, cancelJob } from './lib/jobs.js';

export { createJob, updateJob, getJob, subscribe } from './lib/jobs.js';
export { runJob } from './lib/jobRunner.js';

export const jobsRouter = Router();

/** GET /api/jobs?projectId= — list jobs, newest first */
jobsRouter.get('/jobs', (req, res) => {
  const { projectId } = req.query;
  const all = listJobs().filter((j) => !projectId || j.projectId === projectId);
  res.json({ data: all.map(summarize), total: all.length });
});

/** GET /api/jobs/:id — job summary */
jobsRouter.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(summarize(job));
});

/** GET /api/jobs/:id/result — full result of a completed job */
jobsRouter.get('/jobs/:id/result', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'complete') return res.status(409).json({ error: 'Job not complete' });
  res.json(job.result);
});

/** DELETE /api/jobs/:id — cancel a queued/running job, or drop a finished one */
jobsRouter.delete('/jobs/:id', (req, res) => {
  if (!cancelJob(req.params.id)) return res.status(404).json({ error: 'Job not found' });
  res.status(204).end();
});
