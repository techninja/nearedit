/**
 * The export dialog's body in its three states — choosing options,
 * rendering, done — as template functions for `<export-dialog>`.
 * @module utils/ui/exportViews
 */

import { html } from 'hybrids';
import { summaryText } from '#utils/ui/exportPlan.js';
import { exportAgain } from '#utils/ui/exportRun.js';
import { formatBytes } from '#utils/ui/format.js';

/** @typedef {import('#utils/ui/exportController.js').ExportState} ExportState */

/**
 * What will be rendered, as the server sees it — or why it cannot be.
 * @param {ExportState} state
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
function summary(state) {
  if (state.planError)
    return html`<p class="export-dialog-summary export-dialog-blocked" role="alert">
      <strong>This cannot be rendered yet</strong>
      <span>${state.planError}</span>
    </p>`;
  const warnings = state.plan?.warnings || [];
  return html`<div class="export-dialog-summary" role="status">
    <strong>What will be rendered</strong>
    <span class="export-dialog-facts">
      ${state.plan ? `MP4 (H.264 + AAC) · ${summaryText(state.plan)}` : 'Checking the timeline…'}
    </span>
    ${warnings.length
      ? html`<ul class="export-dialog-warnings">
          ${warnings.map((warning) => html`<li>${warning}</li>`)}
        </ul>`
      : html``}
  </div>`;
}

/**
 * @param {ExportState} state
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
function running(state) {
  const progress = Math.round(state.job?.progress || 0);
  const log = state.job?.log || [];
  const waiting = !state.job || state.job.status === 'queued';
  return html`
    <div class="export-dialog-running" role="status">
      <strong>${waiting ? 'Starting the render…' : `Rendering… ${progress}%`}</strong>
      <div
        class="progress"
        role="progressbar"
        aria-label="Render progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${progress}"
      >
        <div class="progress-bar" style="${{ width: `${progress}%` }}"></div>
      </div>
      <span class="export-dialog-log">${log[log.length - 1] || ''}</span>
      ${state.saveWarning
        ? html`<p class="export-dialog-warning">
            ${state.saveWarning} The render uses the timeline as it is on screen.
          </p>`
        : html``}
      <p class="app-muted">
        The render runs on the server. You can keep editing, hide this window or even close the tab
        — it shows up under Jobs, and under Renders on the project page when it is done.
      </p>
    </div>
  `;
}

/**
 * @param {any} result - Result of a render job
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
function done(result) {
  return html`
    <div class="export-dialog-done">
      <app-icon name="success" size="lg"></app-icon>
      <strong class="export-dialog-file">${result.file}</strong>
      <span class="export-dialog-facts">${summaryText(result)} · ${formatBytes(result.size)}</span>
      <div class="export-dialog-links">
        <a class="btn btn-primary" href="${`${result.url}?download`}" download data-autofocus>
          <app-icon name="export" size="sm"></app-icon> Download
        </a>
        <a class="btn btn-secondary" href="${result.url}" target="_blank" rel="noopener">
          <app-icon name="open" size="sm"></app-icon> Open
        </a>
        <button type="button" class="btn btn-ghost" onclick="${exportAgain}">Export again</button>
      </div>
      <p class="app-muted">
        The file stays on the server, listed under Renders on the project page.
      </p>
    </div>
  `;
}

/**
 * @param {ExportState} state
 * @param {import('#utils/ui/exportPlan.js').RangeChoice[]} ranges
 * @param {any} [note] - Template shown above the summary (web clips that need recording)
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function exportBody(state, ranges, note = html``) {
  if (state.job || state.starting) return running(state);
  if (state.result) return done(state.result);
  return html`
    ${state.error
      ? html`<p class="export-dialog-summary export-dialog-blocked" role="alert">
          <strong>The render failed</strong><span>${state.error}</span>
        </p>`
      : html``}
    <export-options
      presets="${state.presets}"
      preset="${state.preset}"
      ranges="${ranges}"
      rangeId="${state.rangeId}"
      filename="${state.filename}"
    ></export-options>
    ${note} ${summary(state)}
  `;
}
