/**
 * What the transcript panel shows instead of a transcript: why there is
 * none, and — when one can be made — a Transcribe button with live
 * progress. Reports with bubbling events: `transcript-transcribe` and
 * `transcript-cancel`.
 * @module components/molecules/transcript-empty
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TranscriptEmptyHost
 * @property {{ title?: string, detail?: string, canTranscribe?: boolean }} reason - `explainMissing`
 * @property {{ active?: boolean, label?: string, progress?: number, detail?: string }} job - Running transcription
 * @property {string} error - Why the last attempt failed, '' when it did not
 * @property {boolean} loading - The sidecar is being fetched
 */

/** @typedef {TranscriptEmptyHost & HTMLElement} Host */

/** @param {Host} host */
function handleTranscribe(host) {
  dispatch(host, 'transcript-transcribe', { bubbles: true });
}

/** @param {Host} host */
function handleCancel(host) {
  dispatch(host, 'transcript-cancel', { bubbles: true });
}

/**
 * @param {TranscriptEmptyHost['job']} job
 * @returns {import('hybrids').UpdateFunctionWithMethods<TranscriptEmptyHost>}
 */
function progress(job) {
  const percent = Math.round(Math.min(100, Math.max(0, job.progress || 0)));
  return html`
    <strong>${job.label || 'Transcribing…'}</strong>
    <div
      class="progress transcript-empty-progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="${percent}"
    >
      <div class="progress-bar" style="${{ width: `${percent}%` }}"></div>
    </div>
    <span>${percent}%${job.detail ? ` — ${job.detail}` : ''}</span>
    <button type="button" class="btn btn-secondary" onclick="${handleCancel}">Cancel</button>
  `;
}

/** @type {import('hybrids').Component<TranscriptEmptyHost>} */
export default define({
  tag: 'transcript-empty',
  reason: { value: {} },
  job: { value: {} },
  error: '',
  loading: false,
  render: {
    value: ({ reason, job, error, loading }) => html`
      <div class="empty-state" role="status">
        ${loading
          ? html`<span class="spinner" aria-hidden="true"></span
              ><span>Loading the transcript…</span>`
          : job.active
            ? progress(job)
            : html`
                <app-icon name="captions" size="lg"></app-icon>
                <strong>${reason.title}</strong>
                <span class="transcript-empty-detail">${reason.detail}</span>
                ${error && html`<span class="error-message">${error}</span>`}
                ${reason.canTranscribe &&
                html`<button type="button" class="btn btn-primary" onclick="${handleTranscribe}">
                  <app-icon name="mic" size="sm"></app-icon> Transcribe
                </button>`}
              `}
      </div>
    `,
    shadow: false,
  },
});
