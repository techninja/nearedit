/**
 * Client for background jobs: start one, follow its progress, get its result.
 * Progress arrives over the WebSocket; a slow poll covers a dropped socket.
 * Contract: docs/app-spec/API.md § Jobs.
 * @module utils/api/jobs
 */

import { api, query } from './http.js';
import { onMessage } from './ws.js';

/**
 * @typedef {Object} JobSummary
 * @property {string} id
 * @property {string} type
 * @property {'queued'|'running'|'complete'|'error'|'cancelled'} status
 * @property {string} projectId
 * @property {string} label
 * @property {number} progress
 * @property {string} error
 * @property {string[]} log
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {boolean} hasResult
 * @property {Record<string, string|number|boolean>} result
 */

const POLL_MS = 3000;
const DONE = ['complete', 'error', 'cancelled'];

/**
 * Listen to every job update.
 * @param {(job: JobSummary) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onJobUpdate(handler) {
  return onMessage('job_update', (message) => handler(message.job));
}

/**
 * @param {string} [projectId]
 * @returns {Promise<JobSummary[]>} Newest first
 */
export async function listJobs(projectId) {
  return (await api(`/jobs${query({ projectId })}`)).data;
}

/**
 * Cancel a running job, or dismiss a finished one.
 * @param {string} jobId
 * @returns {Promise<void>}
 */
export async function cancelJob(jobId) {
  await api(`/jobs/${jobId}`, { method: 'DELETE' });
}

/**
 * Follow a job until it finishes.
 * @param {string} jobId
 * @param {{ onUpdate?: (job: JobSummary) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<any>} The job's full result
 */
export function waitForJob(jobId, opts = {}) {
  const { onUpdate, signal } = opts;
  return new Promise((resolve, reject) => {
    let settled = false;
    /** @type {() => void} */
    let cleanup = () => {};

    /** @param {JobSummary} job */
    const handle = (job) => {
      if (settled || job.id !== jobId) return;
      onUpdate?.(job);
      if (!DONE.includes(job.status)) return;
      settled = true;
      cleanup();
      if (job.status === 'complete') api(`/jobs/${jobId}/result`).then(resolve, reject);
      else reject(new Error(job.status === 'cancelled' ? 'Cancelled' : job.error || 'Job failed'));
    };
    const poll = () => api(`/jobs/${jobId}`).then(handle, () => {});
    const unsubscribe = onJobUpdate(handle);
    const timer = setInterval(poll, POLL_MS);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      cancelJob(jobId).catch(() => {});
      reject(new Error('Cancelled'));
    };
    cleanup = () => {
      unsubscribe();
      clearInterval(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    poll(); // the job may already have finished before we subscribed
  });
}

/**
 * POST to a job-starting route (anything answering `202 { jobId }`) and wait
 * for the result.
 * @param {string} path - API path, e.g. `/render`
 * @param {unknown} body
 * @param {{ onUpdate?: (job: JobSummary) => void, signal?: AbortSignal,
 *   onStart?: (jobId: string) => void }} [opts]
 * @returns {Promise<any>} The job's full result
 */
export async function runJob(path, body, opts = {}) {
  const { jobId } = await api(path, { body, signal: opts.signal });
  opts.onStart?.(jobId);
  return waitForJob(jobId, opts);
}
