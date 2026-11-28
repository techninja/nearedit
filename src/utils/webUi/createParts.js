/**
 * Pieces of the Create tab's Web section (`<web-create>`): the note shown
 * when the server cannot record, and the list of recent addresses.
 * @module utils/webUi/createParts
 */

import { html } from 'hybrids';
import { loadCaptureStatus } from './captureStatus.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** Look for a browser again (after installing one). */
const handleRecheck = () => void loadCaptureStatus({ fresh: true });

/**
 * Why this server cannot record, in its own words, and what to do.
 * @param {import('./captureStatus.js').CaptureState} capture
 * @returns {Template} Nothing while it can, or while that is not known yet
 */
export function captureNote({ status, available, reason }) {
  if (status === 'unknown' || status === 'loading' || available) return html``;
  return html`<div class="app-callout web-create-capture" role="status">
    <app-icon name="alert" size="sm"></app-icon>
    <div class="app-callout-body">
      <strong>This server cannot record web pages yet</strong>
      <span class="web-create-reason">${reason}</span>
      <span>You can add the clip and write its steps now, and record it later.</span>
      <button type="button" class="btn btn-ghost" onclick="${handleRecheck}">Check again</button>
    </div>
  </div>`;
}

/**
 * @param {string[]} recent - Addresses, newest first
 * @param {(host: any, event: Event) => void} onPick - Handler of a press on one
 * @returns {Template}
 */
export function recentList(recent, onPick) {
  if (!recent.length) return html``;
  return html`<div class="field-group-title">Recent addresses</div>
    <ul class="web-create-recent">
      ${recent.map(
        (url) =>
          html`<li>
            <button type="button" data-url="${url}" title="${url}" onclick="${onPick}">
              ${url.replace(/^https?:\/\//, '')}
            </button>
          </li>`,
      )}
    </ul>`;
}
