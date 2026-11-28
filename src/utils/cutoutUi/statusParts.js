/**
 * The status half of the inspector's "Cut out person" group as template
 * functions: where a media file's cutout stands — with its progress and a
 * button to cancel or to try again — and what to do when the server cannot
 * make cutouts at all.
 * @module utils/cutoutUi/statusParts
 */

import { html } from 'hybrids';
import * as on from './inspectorEvents.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * Where the cutout of one media file stands. Not a live region: the frame
 * count changes several times a second (`<cutout-watch>` tells screen
 * readers when a cutout starts or fails, a toast when one is ready).
 * @param {import('./inspectorView.js').FileRow} file
 * @param {boolean} named - Say which file (several are selected)
 * @returns {Template}
 */
export function statusRow(file, named) {
  const { stage, stale, text, progress, action } = file.status;
  const making = stage === 'making';
  const prefix = `${named ? `${file.name}: ` : ''}${stage === 'failed' ? 'Failed — ' : ''}`;
  return html`
    <div class="cutout-inspector-status" data-stage="${stage}" data-stale="${String(stale)}">
      <span class="cutout-inspector-text">${prefix}${text}</span>
      ${action === 'cancel'
        ? html`<button
            type="button"
            class="btn btn-ghost"
            data-path="${file.path}"
            onclick="${on.handleCancel}"
          >
            Cancel
          </button>`
        : html``}
      ${action === 'retry'
        ? html`<button
            type="button"
            class="btn btn-secondary"
            data-path="${file.path}"
            onclick="${on.handleRetry}"
          >
            <app-icon name="refresh" size="sm"></app-icon>
            ${stage === 'failed' ? 'Try again' : 'Make it'}
          </button>`
        : html``}
    </div>
    ${making
      ? html`<div
          class="progress cutout-inspector-progress"
          role="progressbar"
          aria-label="${`Cutout of ${file.name}`}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${Math.round(progress)}"
        >
          <div class="progress-bar" style="${{ width: `${progress}%` }}"></div>
        </div>`
      : html``}
    ${stale && making
      ? html`<p class="cutout-inspector-hint">
          The clip now plays more than was cut out. The part that is made keeps playing.
        </p>`
      : html``}
  `;
}

/**
 * What is missing on a server that cannot make cutouts, and how to get it.
 * @param {import('./state.js').Availability} availability
 * @returns {Template} Nothing while the server can, or has not answered
 */
export function missingNote(availability) {
  if (!availability.known || availability.available) return html``;
  return html`<div class="app-callout cutout-inspector-missing" role="note">
    <app-icon name="info" size="sm"></app-icon>
    <div class="app-callout-body">
      <strong>This server cannot make cutouts yet</strong>
      <span class="cutout-inspector-reason">${availability.reason}</span>
      <span
        >Run <code>npm run install-cutout</code> on the machine NearEdit runs on: it downloads the
        model and says what else is needed.</span
      >
      <span>
        <button
          type="button"
          class="btn btn-secondary"
          disabled="${availability.checking}"
          onclick="${on.handleCheck}"
        >
          <app-icon name="refresh" size="sm"></app-icon>
          ${availability.checking ? 'Checking…' : 'Check again'}
        </button>
      </span>
    </div>
  </div>`;
}
