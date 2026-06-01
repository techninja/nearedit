/**
 * Job queue — manages long-running tasks (LLM generation, transcription, etc.)
 * Jobs persist in memory and survive browser disconnects.
 * Clients subscribe to updates via WebSocket.
 * @module api/jobs
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export const jobsRouter = Router();

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} type - 'director' | 'transcribe' | 'tag' | 'index'
 * @property {string} status - 'queued' | 'running' | 'complete' | 'error'
 * @property {object} params - Input parameters
 * @property {object|null} result - Output when complete
 * @property {string} error - Error message if failed
 * @property {string[]} log - Progress messages
 * @property {number} progress - 0-100
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, Job>} */
const jobs = new Map();

/** @type {Set<function>} WebSocket broadcast subscribers */
const subscribers = new Set();

/** Max jobs to keep in memory */
const MAX_JOBS = 50;

/**
 * Create a new job.
 * @param {string} type
 * @param {object} params
 * @returns {Job}
 */
export function createJob(type, params) {
  // Prune old completed jobs if over limit
  if (jobs.size >= MAX_JOBS) {
    const sorted = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const old of sorted) {
      if (old.status === 'complete' || old.status === 'error') {
        jobs.delete(old.id);
        if (jobs.size < MAX_JOBS) break;
      }
    }
  }

  const job = {
    id: randomUUID(),
    type,
    status: 'queued',
    params,
    result: null,
    error: '',
    log: [],
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  broadcast(job);
  return job;
}

/**
 * Update a job's status/progress.
 * @param {string} id
 * @param {Partial<Job>} updates
 */
export function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, updates, { updatedAt: Date.now() });
  if (updates.log) job.log = [...job.log, ...updates.log];
  broadcast(job);
}

/**
 * Get a job by ID.
 * @param {string} id
 * @returns {Job|undefined}
 */
export function getJob(id) {
  return jobs.get(id);
}

/**
 * Broadcast job update to all WebSocket subscribers.
 * @param {Job} job
 */
function broadcast(job) {
  const msg = JSON.stringify({ type: 'job_update', job: sanitizeJob(job) });
  for (const send of subscribers) {
    try { send(msg); } catch {}
  }
}

/** Strip large result from broadcast (client fetches full result separately) */
function sanitizeJob(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    error: job.error,
    log: job.log.slice(-5),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    hasResult: !!job.result,
    // Include lightweight result metadata for matching (not full data)
    result: job.result ? { key: job.result.key, path: job.result.path } : null,
  };
}

/**
 * Register a WebSocket send function for broadcasts.
 * @param {function} sendFn
 * @returns {function} unsubscribe
 */
export function subscribe(sendFn) {
  subscribers.add(sendFn);
  return () => subscribers.delete(sendFn);
}

// --- REST API ---

/** GET /api/jobs — list all jobs */
jobsRouter.get('/jobs', (_req, res) => {
  const all = [...jobs.values()].map(sanitizeJob).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ data: all });
});

/** GET /api/jobs/:id — get job details */
jobsRouter.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

/** GET /api/jobs/:id/result — get job result (full EDL) */
jobsRouter.get('/jobs/:id/result', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'complete') return res.status(409).json({ error: 'Job not complete' });
  res.json(job.result);
});

/** DELETE /api/jobs/:id — cancel/remove a job */
jobsRouter.delete('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  jobs.delete(req.params.id);
  broadcast({ ...job, status: 'cancelled' });
  res.status(204).end();
});
