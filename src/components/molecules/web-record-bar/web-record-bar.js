/**
 * Record bar of the web editor — where the clip stands (not recorded,
 * recorded, out of date, recording with its progress), why the last
 * recording failed, and the button that starts one or cancels the one
 * under way. Sends bubbling `web-record` and `web-cancel` events.
 * @module components/molecules/web-record-bar
 */

import { define, dispatch, html } from 'hybrids';
import { isRecording } from '#utils/webUi/clipStatus.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} WebRecordBarHost
 * @property {{ state: string, text: string, action: string }} status - `webClipStatus`
 * @property {import('#utils/webUi/clipStatus.js').RecordingProgress|null} recording
 * @property {import('#utils/webUi/captureStatus.js').CaptureState} capture
 * @property {boolean} locked - The clip is on a locked track
 */

/** @param {WebRecordBarHost & HTMLElement} host */
function handleRecord(host) {
  dispatch(host, 'web-record', { bubbles: true });
}

/** @param {WebRecordBarHost & HTMLElement} host */
function handleCancel(host) {
  dispatch(host, 'web-cancel', { bubbles: true });
}

/** @type {import('hybrids').Component<WebRecordBarHost>} */
export default define({
  tag: 'web-record-bar',
  status: { value: { state: '', text: '', action: 'Record' } },
  recording: { value: /** @type {any} */ (null) },
  capture: { value: /** @type {any} */ ({ status: 'unknown', available: false, reason: '' }) },
  locked: false,
  render: {
    value: ({ status, recording, capture, locked }) => {
      const active = isRecording(recording);
      const progress = Math.round(recording?.progress || 0);
      const noBrowser = capture.status === 'ready' && !capture.available;
      return html`
        <div class="web-record-bar-state" data-state="${status.state}">
          <span class="web-record-bar-dot" aria-hidden="true"></span>
          <span role="status">${status.text}</span>
          ${active
            ? html`<div
                class="progress"
                role="progressbar"
                aria-label="Recording progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${progress}"
              >
                <div class="progress-bar" style="${{ width: `${progress}%` }}"></div>
              </div>`
            : html``}
        </div>
        ${!active && recording?.message
          ? html`<p class="error-message web-record-bar-problem" role="alert">
              <app-icon name="alert" size="sm"></app-icon> ${recording.message}
            </p>`
          : html``}
        ${noBrowser && !active && !recording?.message
          ? html`<p class="app-muted web-record-bar-problem" title="${capture.reason}">
              This server cannot record yet: ${capture.reason}
            </p>`
          : html``}
        ${active
          ? html`<button type="button" class="btn btn-secondary" onclick="${handleCancel}">
              Cancel recording
            </button>`
          : html`<button
              type="button"
              class="btn btn-primary web-record-bar-go"
              disabled="${locked}"
              onclick="${handleRecord}"
            >
              <app-icon name="record" size="sm"></app-icon> ${status.action || 'Record'}
            </button>`}
      `;
    },
    shadow: false,
  },
});
