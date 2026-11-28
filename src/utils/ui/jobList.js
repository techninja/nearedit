/**
 * Job list logic for the job tray — merging updates, deciding what to
 * show, wording outcomes. Pure; `jobCenter.js` feeds it live data.
 * Job shape: JobSummary in docs/app-spec/API.md § Jobs.
 * @module utils/ui/jobList
 */

import { formatBytes } from '#utils/ui/format.js';

/** @typedef {import('#utils/api/jobs.js').JobSummary} JobSummary */

/** Jobs worth telling the user about when they finish. */
export const LONG_TYPES = ['render', 'analyze', 'director', 'script', 'transcribe', 'tag', 'web'];
/** Housekeeping jobs: listed only when they fail. */
const QUIET_TYPES = ['waveform', 'index'];
const FINISHED = ['complete', 'error', 'cancelled'];

/** @param {JobSummary} job @returns {boolean} */
export const isActive = (job) => job.status === 'queued' || job.status === 'running';

/** @param {JobSummary} job @returns {boolean} */
export const isLong = (job) => LONG_TYPES.includes(job.type);

/**
 * Newest first.
 * @param {JobSummary[]} jobs
 * @returns {JobSummary[]}
 */
const sorted = (jobs) => [...jobs].sort((a, b) => b.createdAt - a.createdAt);

/**
 * Add or replace one job. An update older than what is already held (a
 * late poll answer overtaken by the socket) is ignored.
 * @param {JobSummary[]} jobs
 * @param {JobSummary} job
 * @returns {JobSummary[]}
 */
export function upsertJob(jobs, job) {
  const held = jobs.find((j) => j.id === job.id);
  if (held && held.updatedAt > job.updatedAt) return jobs;
  return sorted([...jobs.filter((j) => j.id !== job.id), job]);
}

/**
 * @param {JobSummary[]} jobs
 * @param {string} id
 * @returns {JobSummary[]}
 */
export const removeJob = (jobs, id) => jobs.filter((job) => job.id !== id);

/**
 * Whether this update is the moment a job ended that we saw running.
 * A job first seen already finished (after a reload) is old news.
 * @param {JobSummary|undefined} previous - What was held before the update
 * @param {JobSummary} next
 * @returns {boolean}
 */
export function justFinished(previous, next) {
  return Boolean(previous) && isActive(previous) && FINISHED.includes(next.status);
}

/**
 * The jobs the tray lists for a project.
 * @param {JobSummary[]} jobs
 * @param {string} [projectId] - Omit for every project
 * @returns {JobSummary[]}
 */
export function trayJobs(jobs, projectId = '') {
  return jobs.filter((job) => {
    if (projectId && job.projectId !== projectId) return false;
    return !QUIET_TYPES.includes(job.type) || job.status === 'error';
  });
}

/** @param {JobSummary[]} jobs @returns {number} */
export const activeCount = (jobs) => jobs.filter(isActive).length;

/**
 * Status in words.
 * @param {JobSummary} job
 * @returns {string}
 */
export function statusText(job) {
  const texts = {
    queued: 'Waiting',
    running: `${Math.round(job.progress || 0)}%`,
    complete: 'Done',
    error: 'Failed',
    cancelled: 'Cancelled',
  };
  return texts[job.status] || job.status;
}

/**
 * How to announce a finished job (toast and desktop notification).
 * @param {JobSummary} job - A job with status `complete` or `error`
 * @returns {{ kind: 'success'|'error', title: string, detail: string,
 *   actions: import('#utils/ui/toast.js').ToastAction[] }}
 */
export function jobOutcome(job) {
  const label = job.label || job.type;
  if (job.status === 'error')
    return { kind: 'error', title: `${label} failed`, detail: job.error || '', actions: [] };
  const result = job.result || {};
  if (job.type === 'render' && typeof result.url === 'string') {
    const detail = [result.file, formatBytes(Number(result.size))].filter(Boolean).join(' · ');
    const actions = [
      { label: 'Download', href: `${result.url}?download`, download: true },
      { label: 'Open', href: result.url },
    ];
    return { kind: 'success', title: 'Render finished', detail, actions };
  }
  if (job.type === 'analyze') {
    const total = Number(result.total) || 0;
    const failed = Number(result.failed) || 0;
    const files = `${total} file${total === 1 ? '' : 's'} analysed`;
    const detail = failed ? `${files}, ${failed} with problems — see the job log` : files;
    return { kind: failed ? 'error' : 'success', title: 'Analysis finished', detail, actions: [] };
  }
  const detail = typeof result.summary === 'string' ? result.summary : '';
  return { kind: 'success', title: `${label} finished`, detail, actions: [] };
}
