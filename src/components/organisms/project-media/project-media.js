/**
 * Media overview organism — what the project's folders hold, how much of
 * it has been analysed, and the "Analyse project" button with the running
 * job's progress. State: `#utils/projects/projectPage.js`; the job comes
 * from the job centre.
 * @module components/organisms/project-media
 */

import { html, define } from 'hybrids';
import { analysisCoverage, analysisPending, mediaOverview } from '#utils/projects/coverage.js';
import { startAnalysis } from '#utils/projects/projectActions.js';
import { projectPageState, reloadMedia, runningAnalysis } from '#utils/projects/projectPage.js';
import { countOf, formatBytes, formatDuration } from '#utils/ui/format.js';
import { cancelOrDismiss, jobState } from '#utils/ui/jobCenter.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/index.js';
import '#molecules/project-coverage/index.js';

/**
 * @typedef {Object} ProjectMediaHost
 * @property {import('#utils/projects/projectPage.js').ProjectPageState} state
 * @property {{ jobs: import('#utils/api/jobs.js').JobSummary[] }} live
 */

/**
 * The running analysis job: progress, last log line, cancel.
 * @param {import('#utils/api/jobs.js').JobSummary} job
 * @returns {import('hybrids').UpdateFunctionWithMethods<ProjectMediaHost>}
 */
function progress(job) {
  const waiting = job.status === 'queued';
  return html`
    <div class="project-media-job" role="status">
      <div class="project-media-job-head">
        <span class="spinner"></span>
        <strong>${waiting ? 'Waiting to analyse…' : `Analysing… ${job.progress}%`}</strong>
        <button type="button" class="btn btn-ghost" onclick="${() => cancelOrDismiss(job)}">
          Cancel
        </button>
      </div>
      <div class="progress">
        <div class="progress-bar" style="${{ width: `${job.progress}%` }}"></div>
      </div>
      <span class="app-muted project-media-job-log">${job.log[job.log.length - 1] || ''}</span>
    </div>
  `;
}

/**
 * @param {ReturnType<typeof mediaOverview>} overview
 * @returns {string} "3 videos, 1 audio file, 2 images"
 */
function kinds(overview) {
  const parts = [
    countOf(overview.video, 'video'),
    countOf(overview.audio, 'audio file'),
    countOf(overview.image, 'image'),
  ];
  if (overview.text) parts.push(countOf(overview.text, 'text file'));
  return parts.join(', ');
}

const PENDING_NOTE =
  'Analysis finds shots, pauses and beats so the director can build a rough cut. ' +
  'It runs on the server; you can keep working, or close this tab.';
const DONE_NOTE = 'Everything that can be analysed with the current setup has been.';

/** @type {import('hybrids').Component<ProjectMediaHost>} */
export default define({
  tag: 'project-media',
  state: watch(projectPageState),
  live: watch(jobState),
  render: {
    value: ({ state, live }) => {
      const { media, mediaLoading, mediaError, status, project } = state;
      const overview = mediaOverview(media);
      const rows = analysisCoverage(media);
      const job = runningAnalysis(live.jobs, state.id);
      const pending = analysisPending(rows, status || {});
      return html`
        <section class="app-card" aria-labelledby="project-media-title">
          <header class="app-card-header">
            <h2 class="app-card-title" id="project-media-title">
              <app-icon name="film" size="sm"></app-icon> Media
            </h2>
            <button
              type="button"
              class="icon-btn"
              aria-label="Scan the folders again"
              title="Scan the folders again"
              disabled="${mediaLoading}"
              onclick="${reloadMedia}"
            >
              <app-icon name="refresh" size="sm"></app-icon>
            </button>
            <button
              type="button"
              class="btn ${pending ? 'btn-primary' : 'btn-secondary'} project-media-analyse"
              disabled="${Boolean(job) || !overview.total}"
              onclick="${startAnalysis}"
            >
              <app-icon name="scan" size="sm"></app-icon> Analyse project
            </button>
          </header>
          <div class="app-card-body project-media-body">
            ${mediaError ? html`<p class="error-message" role="alert">${mediaError}</p>` : html``}
            ${overview.total
              ? html`<p class="project-media-summary">
                    <strong>${countOf(overview.total, 'file')}</strong> — ${kinds(overview)} ·
                    ${formatDuration(overview.duration)} of footage · ${formatBytes(overview.size)}
                  </p>
                  ${job ? progress(job) : html``}
                  <project-coverage rows="${rows}" status="${status || {}}"></project-coverage>
                  <p class="app-muted">${pending ? PENDING_NOTE : DONE_NOTE}</p>`
              : html`<p class="empty-state">
                  ${mediaLoading
                    ? 'Looking for media…'
                    : html`<span
                        >No media found yet. Put video, audio or images into
                        <code>${project?.path}</code> — or add another media folder — and scan
                        again.</span
                      >`}
                </p>`}
          </div>
        </section>
      `;
    },
    shadow: false,
  },
});
