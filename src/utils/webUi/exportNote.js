/**
 * The export dialog's note about web clips: a render shows a web clip as
 * its recording is — so when some were never recorded, or are out of date,
 * the dialog says so and offers to record them first.
 * @module utils/webUi/exportNote
 */

import { html } from 'hybrids';
import { refreshPlan } from '#utils/ui/exportController.js';
import { isRecording, webClipsToRecord } from './clipStatus.js';
import { recordAllStale } from './recording.js';

/**
 * Record every web clip that needs it; the note follows their progress.
 * What will be rendered is then asked for again: it has just changed.
 */
const handleRecordAll = () => void recordAllStale().then(refreshPlan);

/**
 * @param {any} doc - The open document
 * @param {{ byClip: Record<string, import('./clipStatus.js').RecordingProgress> }} recordings
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>} Nothing when
 *   every web clip is recorded as its steps say (or there is none)
 */
export function webExportNote(doc, recordings) {
  const need = webClipsToRecord(doc);
  if (!need.total) return html``;
  const waiting = [...need.unrecorded, ...need.stale];
  const active = waiting.filter((clipId) => isRecording(recordings.byClip[clipId]));
  const failed = waiting.map((clipId) => recordings.byClip[clipId]?.message).find(Boolean);
  return html`<div class="app-callout export-dialog-web" role="status">
    <app-icon name="alert" size="sm"></app-icon>
    <div class="app-callout-body">
      <strong>${need.text}</strong>
      <span
        >A render shows a web clip as its recording is: nothing for one that was never recorded, the
        earlier recording for one that is out of date.</span
      >
      ${failed ? html`<span class="error-message">${failed}</span>` : html``}
      ${active.length
        ? html`<span><span class="spinner"></span> Recording ${active.length} of them…</span>`
        : html`<span>
            <button
              type="button"
              class="btn btn-secondary export-dialog-record"
              onclick="${handleRecordAll}"
            >
              <app-icon name="record" size="sm"></app-icon> Record them first
            </button>
          </span>`}
    </div>
  </div>`;
}
