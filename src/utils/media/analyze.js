/**
 * Running analysis from the UI: provider status, analyze jobs, and keeping
 * the media library and the sidecar cache fresh when any analysis job ends.
 * Routes: docs/app-spec/API.md § Intelligence.
 * @module utils/media/analyze
 */

import { api } from '#utils/api/http.js';
import { onJobUpdate, runJob } from '#utils/api/jobs.js';
import { libraryStatus, loadLibrary } from '#utils/media/library.js';
import { forgetSidecars } from '#utils/media/sidecars.js';

/** Job types whose result changes what the library and sidecars say. */
const LIBRARY_JOBS = ['index', 'analyze', 'transcribe', 'tag', 'beats', 'scenes', 'silence'];
const FINISHED = ['complete', 'error', 'cancelled'];
const REFRESH_DELAY_MS = 250;

/** @type {Promise<Record<string, any>>|null} */
let statusRequest = null;

/**
 * Which analysis providers are usable (GET /intelligence/status), fetched
 * once and shared.
 * @param {{ refresh?: boolean }} [opts]
 * @returns {Promise<Record<string, any>>}
 */
export function intelligenceStatus(opts = {}) {
  if (!statusRequest || opts.refresh) {
    const request = api('/intelligence/status');
    statusRequest = request;
    request.catch(() => {
      if (statusRequest === request) statusRequest = null;
    });
  }
  return statusRequest;
}

/**
 * Analyse files as one background job.
 * @param {{ paths?: string[], steps?: string[], force?: boolean }} what -
 *   Without `paths` every file of the open project is analysed
 * @param {{ onUpdate?: (job: import('#utils/api/jobs.js').JobSummary) => void,
 *   signal?: AbortSignal }} [opts]
 * @returns {Promise<{ files: { path: string, steps: Record<string, string> }[] }>}
 */
export function analyzeMedia(what, opts = {}) {
  const body = { projectId: libraryStatus().projectId, ...what };
  return runJob('/intelligence/analyze', body, opts);
}

/**
 * Transcribe one file as a background job.
 * @param {string} filePath
 * @param {{ onUpdate?: (job: import('#utils/api/jobs.js').JobSummary) => void,
 *   signal?: AbortSignal }} [opts]
 * @returns {Promise<Record<string, any>>} The job result
 * @throws {import('#utils/api/http.js').ApiError} 503 when no provider is usable
 */
export function transcribeMedia(filePath, opts = {}) {
  const body = { filePath, projectId: libraryStatus().projectId };
  return runJob('/intelligence/transcribe', body, opts);
}

let watchers = 0;
/** @type {(() => void)|null} */
let stopWatching = null;
let refreshTimer = 0;

/**
 * While at least one panel is watching: when an analysis job finishes
 * (started here or anywhere else), reload the library and drop cached
 * sidecars so badges, tags and transcripts update by themselves.
 * @returns {() => void} Stop watching
 */
export function watchAnalysisJobs() {
  if (watchers++ === 0) {
    stopWatching = onJobUpdate((job) => {
      if (!LIBRARY_JOBS.includes(job.type) || !FINISHED.includes(job.status)) return;
      clearTimeout(refreshTimer);
      refreshTimer = /** @type {any} */ (
        setTimeout(() => {
          forgetSidecars();
          if (libraryStatus().projectId) loadLibrary();
        }, REFRESH_DELAY_MS)
      );
    });
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (--watchers > 0) return;
    clearTimeout(refreshTimer);
    stopWatching?.();
    stopWatching = null;
  };
}
