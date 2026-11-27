/**
 * Analysis strip of the media bin: the running job with live progress and
 * a cancel button, the outcome of the last job, and — plainly — which
 * providers are missing (one line, with the full reasons a click away). Buttons ask with bubbling events: `media-analyze`
 * (`{ scope: 'selected' | 'all' }`), `media-cancel`, `media-dismiss`.
 * @module components/molecules/media-status
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} MediaStatusHost
 * @property {{ active?: boolean, label?: string, progress?: number, detail?: string }} job
 * @property {{ kind?: 'info'|'success'|'warning'|'error', headline?: string,
 *   problems?: string[] }} notice - Last outcome or provider warning; {} for none
 * @property {number} selected - Files selected in the bin
 * @property {number} total - Files in the project
 */

/** @typedef {MediaStatusHost & HTMLElement} Host */

const NOTICE_ICONS = { info: 'info', success: 'success', warning: 'alert', error: 'error' };

/** @param {Host} host @param {Event} event */
function handleAnalyze(host, event) {
  const { scope } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'media-analyze', { detail: { scope }, bubbles: true });
}

/** @param {Host} host */
function handleCancel(host) {
  dispatch(host, 'media-cancel', { bubbles: true });
}

/** @param {Host} host @param {Event} event */
function handleDismiss(host, event) {
  event.preventDefault(); // the button sits in the summary: do not toggle it
  dispatch(host, 'media-dismiss', { bubbles: true });
}

/**
 * @param {MediaStatusHost['job']} job
 * @returns {import('hybrids').UpdateFunctionWithMethods<MediaStatusHost>}
 */
function running(job) {
  const percent = Math.round(Math.min(100, Math.max(0, job.progress || 0)));
  return html`
    <div class="media-status-job" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span class="media-status-label" title="${job.detail || ''}"
        >${job.label || 'Analysing…'}</span
      >
      <span class="media-status-percent">${percent}%</span>
      <button
        type="button"
        class="icon-btn"
        title="Cancel the analysis"
        aria-label="Cancel the analysis"
        onclick="${handleCancel}"
      >
        <app-icon name="x" size="sm"></app-icon>
      </button>
    </div>
    <div
      class="progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="${percent}"
    >
      <div class="progress-bar" style="${{ width: `${percent}%` }}"></div>
    </div>
    ${job.detail && html`<div class="media-status-detail">${job.detail}</div>`}
  `;
}

/** @type {import('hybrids').Component<MediaStatusHost>} */
export default define({
  tag: 'media-status',
  job: { value: {} },
  notice: { value: {} },
  selected: 0,
  total: 0,
  render: {
    value: ({ job, notice, selected, total }) => html`
      ${job.active
        ? running(job)
        : html`<div class="media-status-actions">
            <button
              type="button"
              class="icon-btn"
              data-scope="selected"
              title="Analyse the selected files: details, scenes, beats, silences, transcript, tags"
              disabled="${selected === 0}"
              onclick="${handleAnalyze}"
            >
              <app-icon name="scan" size="sm"></app-icon> Analyse
              selected${selected ? ` (${selected})` : ''}
            </button>
            <button
              type="button"
              class="icon-btn"
              data-scope="all"
              title="Analyse every file of the project that has not been analysed"
              disabled="${total === 0}"
              onclick="${handleAnalyze}"
            >
              Analyse all
            </button>
          </div>`}
      ${notice.headline &&
      html`<details class="media-status-notice media-status-${notice.kind || 'info'}" role="status">
        <summary>
          <app-icon name="${NOTICE_ICONS[notice.kind] || 'info'}" size="sm"></app-icon>
          <strong>${notice.headline}</strong>
          <button
            type="button"
            class="icon-btn"
            title="Dismiss"
            aria-label="Dismiss this message"
            onclick="${handleDismiss}"
          >
            <app-icon name="x" size="sm"></app-icon>
          </button>
        </summary>
        <ul>
          ${(notice.problems || []).map((problem) => html`<li>${problem}</li>`)}
        </ul>
      </details>`}
    `,
    shadow: false,
  },
});
