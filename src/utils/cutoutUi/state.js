/**
 * Where the cutouts of the open document stand outside the document: for
 * each media file that is being cut out — or could not be — the job's
 * state, and whether the server can make cutouts at all. The document says
 * the rest (`cutoutState(clip)`): a clip whose cutout is made needs nothing
 * here. The inspector, the timeline badge and the export dialog read this;
 * only the lifecycle (`runtime.js`) writes it.
 * @module utils/cutoutUi/state
 */

import { createObservable } from '#utils/ui/observable.js';

/**
 * The cutout of one media file, while the document does not have it.
 * @typedef {Object} FileJob
 * @property {'starting'|'queued'|'running'|'error'|'cancelled'|'unavailable'} status
 * @property {number} progress - 0..100
 * @property {number} frame - Frames done; 0 until the job says
 * @property {number} frames - Frames to do; 0 until the job says
 * @property {string} message - Why it failed, or what the server is missing
 * @property {number} start - The stretch of the file that was asked for, seconds
 * @property {number} end
 */

/**
 * Can this server make cutouts? (`GET /api/cutout/status`)
 * @typedef {Object} Availability
 * @property {boolean} known - False until the server has answered once
 * @property {boolean} available
 * @property {string} reason - What is missing, in the server's words
 * @property {boolean} checking - A question is under way
 */

/**
 * @typedef {Object} CutoutJobs
 * @property {Record<string, FileJob>} byPath - Keyed by media file (absolute path)
 * @property {Availability} availability
 */

/** @type {Availability} */
export const UNKNOWN = { known: false, available: true, reason: '', checking: false };

/** @type {import('#utils/ui/observable.js').Observable<CutoutJobs>} */
export const cutoutJobs = createObservable({ byPath: {}, availability: UNKNOWN });

/**
 * @param {string} path - A media file
 * @returns {string} Its name, as people know it
 */
export const fileName = (path) => String(path).split(/[\\/]/).pop() || '';

/**
 * @param {FileJob|null|undefined} job
 * @returns {boolean} True while a cutout is (about to be) made
 */
export const isMaking = (job) => ['starting', 'queued', 'running'].includes(job?.status);

/**
 * Say where the cutout of a file stands, or that there is nothing to say.
 * @param {string} path - The media file
 * @param {FileJob|null} job - null: made, or no longer wanted
 */
export function noteFile(path, job) {
  const { byPath } = cutoutJobs.get();
  if (!job && !(path in byPath)) return;
  const next = { ...byPath };
  if (job) next[path] = job;
  else delete next[path];
  cutoutJobs.set({ byPath: next });
}

/**
 * What is going on, in a sentence for people who cannot see the progress
 * bar. It changes when a cutout starts or fails, not with every frame.
 * @param {CutoutJobs} jobs
 * @returns {string} '' when nothing is being made and nothing failed
 */
export function describeJobs(jobs) {
  const files = Object.entries(jobs.byPath);
  const making = files.filter(([, job]) => isMaking(job)).map(([path]) => fileName(path));
  const failed = files.filter(([, job]) => job.status === 'error').map(([path]) => fileName(path));
  if (making.length) return `Cutting out the person in ${making.join(', ')}`;
  return failed.length ? `The cutout of ${failed.join(', ')} failed` : '';
}

/** Forget the jobs (the editor was opened, or a test starts). What the server can do stays known. */
export function resetCutoutJobs() {
  cutoutJobs.set({ byPath: {} });
}
