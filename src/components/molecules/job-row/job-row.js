/**
 * Job row molecule — one background job in the job tray: what it is, how
 * far it is, its last log line, and its error in full when it failed.
 * Announces `jobdismiss` when its button is pressed (cancel while the job
 * is running, dismiss once it has ended).
 * @module components/molecules/job-row
 */

import { html, define, dispatch } from 'hybrids';
import { isActive, statusText } from '#utils/ui/jobList.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} JobRowHost
 * @property {import('#utils/api/jobs.js').JobSummary} job
 */

const ICONS = {
  render: 'export',
  analyze: 'scan',
  director: 'ai',
  script: 'file-text',
  transcribe: 'mic',
  tag: 'image',
  web: 'web',
  beats: 'beat',
  scenes: 'film',
  silence: 'waveform',
  waveform: 'waveform',
  index: 'list',
};

/** @param {JobRowHost & HTMLElement} host */
function handleDismiss(host) {
  dispatch(host, 'jobdismiss', { detail: { job: host.job }, bubbles: true });
}

/**
 * Links to a finished render.
 * @param {Record<string, any>} result
 * @returns {import('hybrids').UpdateFunctionWithMethods<JobRowHost>}
 */
function renderLinks(result) {
  return html`
    <span class="job-row-links">
      <a href="${`${result.url}?download`}" download>Download</a>
      <a href="${result.url}" target="_blank" rel="noopener">Open</a>
    </span>
  `;
}

/** @type {import('hybrids').Component<JobRowHost>} */
export default define({
  tag: 'job-row',
  job: {
    value: /** @type {any} */ ({ id: '', type: '', status: 'queued', label: '', log: [] }),
  },
  render: {
    value: ({ job }) => {
      const active = isActive(job);
      const lastLine = job.log?.[job.log.length - 1] || '';
      const result = job.result || {};
      return html`
        <div class="job-row job-row-${job.status}">
          <app-icon class="job-row-icon" name="${ICONS[job.type] || 'cpu'}" size="sm"></app-icon>
          <div class="job-row-text">
            <strong class="job-row-label">${job.label || job.type}</strong>
            <span class="job-row-status">
              <span class="job-row-state">${statusText(job)}</span>
              ${job.status !== 'error' && lastLine
                ? html`<span class="job-row-log" title="${lastLine}"> · ${lastLine}</span>`
                : html``}
            </span>
            ${active
              ? html`<div
                  class="progress"
                  role="progressbar"
                  aria-label="${job.label || job.type}"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow="${Math.round(job.progress || 0)}"
                >
                  <div class="progress-bar" style="${{ width: `${job.progress || 0}%` }}"></div>
                </div>`
              : html``}
            ${job.status === 'error'
              ? html`<p class="job-row-message" role="alert">${job.error || 'Unknown error'}</p>`
              : html``}
            ${job.status === 'complete' && job.type === 'render' && result.url
              ? renderLinks(result)
              : html``}
          </div>
          <button
            type="button"
            class="icon-btn job-row-dismiss"
            aria-label="${active ? `Cancel ${job.label}` : `Dismiss ${job.label}`}"
            title="${active ? 'Cancel' : 'Dismiss'}"
            onclick="${handleDismiss}"
          >
            <app-icon name="${active ? 'stop' : 'x'}" size="sm"></app-icon>
          </button>
        </div>
      `;
    },
    shadow: false,
  },
});
