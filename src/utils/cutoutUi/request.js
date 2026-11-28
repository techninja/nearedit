/**
 * The cutout's conversation with the server: ask for the cutout of a
 * stretch of a media file and follow the job to its result, and ask
 * whether the server can make cutouts at all. A job for the same file that
 * is already under way — begun before a reload, or in another tab — is
 * followed instead of asking a second time.
 * Contract: docs/app-spec/CUTOUT.md § Server.
 * @module utils/cutoutUi/request
 */

import { api } from '#utils/api/http.js';
import { listJobs, runJob, waitForJob } from '#utils/api/jobs.js';
import { covers } from './needs.js';
import { fileName } from './state.js';

/** @typedef {import('./needs.js').Need} Need */
/** @typedef {import('./state.js').FileJob} FileJob */
/** @typedef {import('#utils/api/jobs.js').JobSummary} JobSummary */

const FRAME = /^frame (\d+) of (\d+)$/;

/** @type {Set<string>} Jobs this page follows itself (`attach.js` leaves them to the lifecycle) */
export const followed = new Set();

/** @type {(path: string) => string} The server's label for the cutout job of a file */
const labelOf = (path) => `Cut out: ${fileName(path)}`;

/**
 * What a job update says about the cutout being made.
 * @param {Partial<JobSummary>} job
 * @returns {Pick<FileJob, 'status'|'progress'|'frame'|'frames'>}
 */
export function jobProgress(job) {
  const line = [...(job.log || [])].reverse().find((entry) => FRAME.test(entry));
  const [, frame, frames] = line ? FRAME.exec(line) : [];
  return {
    status: job.status === 'queued' ? 'queued' : 'running',
    progress: Math.round(job.progress || 0),
    frame: Number(frame) || 0,
    frames: Number(frames) || 0,
  };
}

/**
 * A cutout job of this file that is already queued or running and that this
 * page did not start itself (its own jobs are for other files, or are just
 * being cancelled). A job carries no more of its file than the name.
 * @param {string} projectId
 * @param {string} path
 * @returns {Promise<JobSummary|undefined>}
 */
async function underWay(projectId, path) {
  const jobs = await listJobs(projectId);
  const label = labelOf(path);
  return jobs.find(
    (job) =>
      job.type === 'cutout' &&
      ['queued', 'running'].includes(job.status) &&
      job.label === label &&
      !followed.has(job.id),
  );
}

/**
 * The cutout of a stretch of a media file: made now, found on disk
 * (`cached`), or taken from a job that was already making it.
 * @param {string} projectId
 * @param {Need} need
 * @param {{ signal?: AbortSignal, onProgress?: (patch: Partial<FileJob>) => void }} [opts] -
 *   `signal` cancels the job on the server
 * @returns {Promise<any>} The job's result, as `attachCutout` takes it:
 *   `{ file, key, source, start, end, fps, width, height, frames, cached }`
 * @throws {Error} With the server's reason; `Cancelled` when `signal` fired
 */
export async function requestCutout(projectId, need, opts = {}) {
  const { signal, onProgress } = opts;
  /** @param {JobSummary} job */
  const onUpdate = (job) => onProgress?.(jobProgress(job));
  /** @param {string} jobId */
  const onStart = (jobId) => void followed.add(jobId);
  const running = await underWay(projectId, need.path);
  if (running && !signal?.aborted) {
    onStart(running.id);
    const made = await waitForJob(running.id, { signal, onUpdate }).catch((err) => {
      if (signal?.aborted) throw err;
      return null; // it failed or was cancelled elsewhere: ask for our own
    });
    // A label is only a file's name: the result says which file it really was.
    if (made?.source === need.path && covers(made, need)) return made;
  }
  const { path, start, end, fps } = need;
  return runJob('/cutout', { projectId, path, start, end, fps }, { signal, onUpdate, onStart });
}

/**
 * @returns {Promise<{ available: boolean, reason: string }>} Whether the
 *   server has a matte program, and if not what is missing
 * @param {boolean} [fresh] - Have the server look again instead of remembering
 */
export async function serverStatus(fresh = false) {
  const status = await api(`/cutout/status${fresh ? '?fresh' : ''}`);
  return { available: status?.available === true, reason: String(status?.reason || '') };
}
