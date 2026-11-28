/**
 * Templates of the Captions section that are about the whole timeline:
 * the line that says where captions stand, "Caption all speech", "Save
 * subtitles", and a row for every file that plays on the timeline without
 * a transcript — with a button that transcribes it and captions what plays
 * it, or the reason this server cannot.
 * @module utils/captionsUi/timelineParts
 */

import { html } from 'hybrids';
import { captionAll, transcribeAndCaption } from './actions.js';
import { saveSubtitles } from './subtitles.js';
import { summaryLine } from './summary.js';
import { cancelTranscribe } from './transcribe.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** "Caption all speech". */
const handleAll = () => void captionAll();

/** A subtitle format button. @param {HTMLElement} _host @param {Event} event */
function handleSave(_host, event) {
  void saveSubtitles(/** @type {HTMLElement} */ (event.currentTarget).dataset.format);
}

/** "Transcribe" on a file's row. @param {HTMLElement} _host @param {Event} event */
function handleTranscribe(_host, event) {
  const { file, clips } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  void transcribeAndCaption(file, clips.split(','));
}

/** "Cancel" on a file's row. @param {HTMLElement} _host @param {Event} event */
function handleCancel(_host, event) {
  cancelTranscribe(/** @type {HTMLElement} */ (event.currentTarget).dataset.file);
}

/**
 * A file without a transcript.
 * @param {import('./summary.js').CaptionSummary['missing'][number]} entry
 * @param {import('./transcribe.js').FileJob|undefined} job
 * @param {Record<string, any>|null} provider - Transcription provider status
 * @returns {Template}
 */
function missingRow(entry, job, provider) {
  const cannot = provider?.available === false;
  const what = job?.active
    ? `Transcribing ${entry.name}… ${job.progress} %`
    : `${entry.name} has no transcript${entry.on ? ' — its captions are on, with nothing to show' : ''}`;
  return html`<div
    class="captions-style-missing"
    data-file="${entry.name}"
    data-tone="${entry.on ? 'warn' : 'muted'}"
  >
    <span class="captions-style-missing-text" title="${entry.file}">${what}</span>
    ${job?.active
      ? html`<button
          type="button"
          class="btn btn-ghost"
          data-file="${entry.file}"
          onclick="${handleCancel}"
        >
          Cancel
        </button>`
      : html`<button
          type="button"
          class="btn btn-secondary"
          data-file="${entry.file}"
          data-clips="${entry.clipIds.join(',')}"
          title="${cannot
            ? `This server cannot transcribe: ${provider.detail || 'no provider is configured'}`
            : 'Transcribe this file and caption what plays it'}"
          disabled="${cannot}"
          onclick="${handleTranscribe}"
        >
          <app-icon name="mic" size="sm"></app-icon> Transcribe
        </button>`}
    ${job?.active
      ? html`<div class="progress captions-style-progress">
          <div class="progress-bar" style="${{ width: `${job.progress}%` }}"></div>
        </div>`
      : html``}
    ${!job?.active && job?.error
      ? html`<p class="error-message" role="alert">${job.error}</p>`
      : html``}
  </div>`.key(entry.file);
}

/**
 * The timeline's captions: state, actions, and what lacks a transcript.
 * @param {import('./summary.js').CaptionSummary} summary
 * @param {import('./transcribe.js').TranscribeState} jobs
 * @returns {Template}
 */
export function timelineRows(summary, jobs) {
  return html`
    <p class="captions-style-state" role="status">${summaryLine(summary)}</p>
    <div class="captions-style-actions">
      <button
        type="button"
        class="btn btn-secondary captions-style-all"
        title="Switch captions on for every sound clip that has a transcript"
        disabled="${!summary.voices.length}"
        onclick="${handleAll}"
      >
        <app-icon name="captions" size="sm"></app-icon> Caption all speech
      </button>
      <span class="toolbar-group captions-style-save" role="group" aria-label="Save subtitles">
        <span class="captions-style-save-label">Save subtitles…</span>
        ${['srt', 'vtt'].map(
          (format) =>
            html`<button
              type="button"
              class="icon-btn"
              data-format="${format}"
              title="${`Save the captions as a .${format} subtitle file`}"
              disabled="${!summary.on}"
              onclick="${handleSave}"
            >
              .${format}
            </button>`,
        )}
      </span>
    </div>
    ${summary.missing.map((entry) => missingRow(entry, jobs.byFile[entry.file], jobs.provider))}
  `;
}
