/**
 * Job centre — the live list of background jobs. Started once by the
 * router; the job tray shows it, pages react to finished jobs, and every
 * long job that ends is announced with a toast (and a desktop notification
 * when the tab is in the background).
 * @module utils/ui/jobCenter
 */

import { cancelJob, listJobs, onJobUpdate } from '#utils/api/jobs.js';
import { isConnected, onConnectionChange } from '#utils/api/ws.js';
import { activeCount, isActive, isLong, jobOutcome, justFinished } from '#utils/ui/jobList.js';
import { removeJob, upsertJob } from '#utils/ui/jobList.js';
import { noteLongJobStarted, notifyIfHidden } from '#utils/ui/notify.js';
import { createObservable } from '#utils/ui/observable.js';
import { showError, showToast } from '#utils/ui/toast.js';

/** @typedef {import('#utils/api/jobs.js').JobSummary} JobSummary */

const POLL_MS = 4000;
/** Job types that take long enough to offer desktop notifications when one starts. */
const OFFER_TYPES = ['render', 'analyze', 'transcribe', 'tag', 'script'];

/** @type {import('#utils/ui/observable.js').Observable<{ jobs: JobSummary[] }>} */
export const jobState = createObservable({ jobs: [] });
/** @type {Set<(job: JobSummary) => void>} */
const finishedListeners = new Set();

/**
 * Tell the user and the pages that a job ended.
 * @param {JobSummary} job
 */
function announce(job) {
  for (const listener of [...finishedListeners]) listener(job);
  if (job.status === 'cancelled' || !isLong(job)) return;
  const outcome = jobOutcome(job);
  showToast(outcome);
  notifyIfHidden({ title: `NearEdit — ${outcome.title}`, body: outcome.detail, tag: job.id });
}

/**
 * Take in one job update.
 * @param {JobSummary} job
 * @param {boolean} [live] - It arrived over the socket, as it happened
 */
function receive(job, live = false) {
  const { jobs } = jobState.get();
  const previous = jobs.find((held) => held.id === job.id);
  const next = upsertJob(jobs, job);
  if (next === jobs) return;
  jobState.set({ jobs: next });
  // A long job being created right now — whichever panel started it — is
  // the moment to offer notifications. Jobs found on page load are not.
  if (live && !previous && job.status === 'queued' && OFFER_TYPES.includes(job.type)) {
    noteLongJobStarted();
  }
  if (justFinished(previous, job)) announce(job);
}

/**
 * Load the server's job list. Covers jobs started before this page and
 * updates missed while the socket was down.
 * @returns {Promise<void>}
 */
export async function refreshJobs() {
  try {
    const listed = await listJobs();
    const known = new Set(listed.map((job) => job.id));
    // A job the server no longer has (dismissed elsewhere, restart) is gone here too.
    jobState.set({ jobs: jobState.get().jobs.filter((job) => known.has(job.id)) });
    for (const job of listed) receive(job);
  } catch (err) {
    console.warn('[jobs] could not load the job list:', err.message);
  }
}

/**
 * Start following jobs.
 * @returns {() => void} stop
 */
export function startJobCenter() {
  const stopUpdates = onJobUpdate((job) => receive(job, true));
  // Every (re)connect may follow a gap, so the list is read again.
  const stopStatus = onConnectionChange((open) => {
    if (open) refreshJobs();
  });
  refreshJobs();
  const timer = setInterval(() => {
    if (!isConnected() && activeCount(jobState.get().jobs) > 0) refreshJobs();
  }, POLL_MS);
  return () => {
    stopUpdates();
    stopStatus();
    clearInterval(timer);
  };
}

/**
 * Be told when any job ends (complete, error or cancelled).
 * @param {(job: JobSummary) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onJobFinished(listener) {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

/**
 * Cancel a running job, or dismiss a finished one from the list.
 * @param {JobSummary} job
 * @returns {Promise<void>}
 */
export async function cancelOrDismiss(job) {
  try {
    await cancelJob(job.id);
    if (!isActive(job)) jobState.set({ jobs: removeJob(jobState.get().jobs, job.id) });
  } catch (err) {
    // 404: the server already dropped it — so do we.
    if (err.status === 404) jobState.set({ jobs: removeJob(jobState.get().jobs, job.id) });
    else showError(isActive(job) ? 'Could not cancel the job' : 'Could not dismiss the job', err);
  }
}

/**
 * Dismiss every finished job in a list.
 * @param {JobSummary[]} jobs
 * @returns {Promise<void>}
 */
export async function dismissFinished(jobs) {
  await Promise.all(jobs.filter((job) => !isActive(job)).map(cancelOrDismiss));
}
