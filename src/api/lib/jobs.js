/**
 * Background job queue — renders, analysis, director runs, waveforms.
 * In-memory, cancellable, broadcast to subscribers (WebSocket). See API.md.
 * @module api/lib/jobs
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {'queued'|'running'|'complete'|'error'|'cancelled'} JobStatus
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} type - index|analyze|transcribe|tag|beats|scenes|silence|waveform|director|script|render
 * @property {JobStatus} status
 * @property {string} projectId
 * @property {string} label - Short human-readable description
 * @property {object} params
 * @property {any} result
 * @property {string} error
 * @property {string[]} log
 * @property {number} progress - 0..100
 * @property {number} createdAt
 * @property {number} updatedAt
 * @typedef {Object} JobContext
 * @property {Job} job
 * @property {AbortSignal} signal - Aborted when the job is cancelled
 * @property {(percent: number, message?: string) => void} progress
 * @property {(message: string) => void} log
 */

const MAX_JOBS = 100;
/** @type {Map<string, Job>} */
const jobs = new Map();
/** @type {Set<(message: string) => void>} */
const subscribers = new Set();
/** @type {Map<string, AbortController>} */
const controllers = new Map();

const isDone = (job) => ['complete', 'error', 'cancelled'].includes(job.status);

/**
 * Wire-safe view of a job: no params, and only small scalar result fields.
 * @param {Job} job
 * @returns {object}
 */
export function summarize(job) {
  const result = {};
  for (const [k, v] of Object.entries(job.result || {})) {
    if (['string', 'number', 'boolean'].includes(typeof v) && String(v).length <= 500)
      result[k] = v;
  }
  const summary = { ...job, log: job.log.slice(-5), hasResult: job.result !== null, result };
  delete summary.params;
  return summary;
}

/** @param {Job} job */
function broadcast(job) {
  const message = JSON.stringify({ type: 'job_update', job: summarize(job) });
  for (const send of subscribers) send(message);
}

/**
 * @param {string} type
 * @param {object} [params]
 * @param {{ projectId?: string, label?: string }} [meta]
 * @returns {Job}
 */
export function createJob(type, params = {}, meta = {}) {
  for (const old of [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)) {
    if (jobs.size < MAX_JOBS) break;
    if (isDone(old)) jobs.delete(old.id);
  }
  const now = Date.now();
  /** @type {Job} */
  const job = {
    id: randomUUID(),
    type,
    status: 'queued',
    projectId: meta.projectId || '',
    label: meta.label || type,
    params,
    result: null,
    error: '',
    log: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  broadcast(job);
  return job;
}

/**
 * Patch a job. `log` entries are appended, not replaced.
 * @param {string} id
 * @param {Partial<Job>} updates
 */
export function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return;
  const { log, ...rest } = updates;
  Object.assign(job, rest, { updatedAt: Date.now() });
  if (log) job.log = [...job.log, ...log].slice(-200);
  broadcast(job);
}

/** @param {string} id @returns {Job|undefined} */
export const getJob = (id) => jobs.get(id);

/** @returns {Job[]} Newest first. */
export const listJobs = () => [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);

/**
 * Subscribe to job broadcasts (JSON strings).
 * @param {(message: string) => void} send
 * @returns {() => void} unsubscribe
 */
export function subscribe(send) {
  subscribers.add(send);
  return () => subscribers.delete(send);
}

/**
 * Cancel a queued/running job (aborts its signal) or drop a finished one.
 * @param {string} id
 * @returns {boolean} false when the job does not exist
 */
export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (isDone(job)) {
    jobs.delete(id);
    return true;
  }
  updateJob(id, { status: 'cancelled', log: ['Cancelled'] });
  controllers.get(id)?.abort();
  return true;
}

/**
 * Track the AbortController of a running job so cancelJob can abort it.
 * @param {string} id
 * @param {AbortController|null} controller - null releases the entry
 */
export function setController(id, controller) {
  if (controller) controllers.set(id, controller);
  else controllers.delete(id);
}
