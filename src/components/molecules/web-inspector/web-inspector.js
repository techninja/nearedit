/**
 * Inspector group "Web page" — for a selected web clip: its address and
 * page size, where it stands (not recorded, recorded, out of date,
 * recording with its progress), buttons to edit its steps and to record
 * it, and Zoom: write transform keyframes that zoom in on what the
 * recording clicks, types into and focuses on, with the margin kept
 * around a target and the closest zoom allowed — or remove them again. The
 * keyframes are ordinary ones and show in the keyframe strip.
 * @module components/molecules/web-inspector
 */

import { define, html } from 'hybrids';
import { watch } from '#utils/ui/observable.js';
import { isRecording, webClipStatus } from '#utils/webUi/clipStatus.js';
import * as on from '#utils/webUi/inspectorEvents.js';
import { recordingState } from '#utils/webUi/recording.js';
import { sizeChoices, sizeIdOf } from '#utils/webUi/sizes.js';
import { ZOOM_RANGES, hasZoom, zoomOptions } from '#utils/webUi/zoom.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/webUi/inspectorEvents.js').WebInspectorHost} WebInspectorHost */

/**
 * A read-only line.
 * @param {string} label
 * @param {string} value
 */
const line = (label, value) =>
  html`<div class="field-row">
    <span class="field-label">${label}</span>
    <span class="web-inspector-value" title="${value}">${value}</span>
  </div>`;

/**
 * A zoom setting.
 * @param {'margin'|'maxZoom'} name
 * @param {string} label
 * @param {string} hint
 * @param {number} value
 * @param {boolean} disabled
 */
function setting(name, label, hint, value, disabled) {
  const [min, max, step] = ZOOM_RANGES[name];
  return html`<label class="field-row" title="${hint}">
    <span class="field-label">${label}</span>
    <input
      class="field-input field-num"
      type="number"
      data-name="${name}"
      aria-label="${label}"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${value}"
      disabled="${disabled}"
      onchange="${on.handleOption}"
    />
  </label>`;
}

/** @type {import('hybrids').Component<WebInspectorHost>} */
export default define({
  tag: 'web-inspector',
  model: { value: /** @type {any} */ ({}) },
  recordings: watch(recordingState),
  zoom: watch(zoomOptions),
  message: '',
  working: false,
  render: {
    value: (host) => {
      const subject = on.subjectOf(host);
      if (!subject) return html``;
      const { clip } = subject;
      const { model, zoom, message, working } = host;
      const recording = host.recordings.byClip[clip.clipId] || null;
      const status = webClipStatus(clip, model.fps, recording);
      const active = isRecording(recording);
      const { recipe } = clip.web;
      const size = sizeChoices(recipe).find(([id]) => id === sizeIdOf(recipe))[1];
      const recorded = Boolean(clip.web.key && clip.sourceFile);
      return html`
        <div class="field-group-title">Web page</div>
        ${line('Address', recipe.url)} ${line('Size', `${size} · ${recipe.scale}×`)}
        <div class="field-row">
          <span class="field-label">Status</span>
          <span class="web-inspector-status" data-state="${status.state}" role="status"
            >${status.text}</span
          >
        </div>
        ${active
          ? html`<div class="progress web-inspector-progress">
              <div class="progress-bar" style="${{ width: `${recording.progress || 0}%` }}"></div>
            </div>`
          : html``}
        ${!active && recording?.message
          ? html`<p class="error-message" role="alert">${recording.message}</p>`
          : html``}
        <div class="web-inspector-actions">
          <button type="button" class="btn btn-secondary" onclick="${on.handleEdit}">
            <app-icon name="edit" size="sm"></app-icon> Edit steps…
          </button>
          ${active
            ? html`<button type="button" class="btn btn-secondary" onclick="${on.handleCancel}">
                Cancel recording
              </button>`
            : html`<button
                type="button"
                class="btn btn-primary"
                disabled="${model.locked}"
                onclick="${on.handleRecord}"
              >
                <app-icon name="record" size="sm"></app-icon> ${status.action}
              </button>`}
        </div>
        <div class="field-group-title">Zoom</div>
        ${setting('margin', 'Margin', 'Room kept around a target', zoom.margin, model.locked)}
        ${setting('maxZoom', 'Maximum zoom', 'Never closer than this', zoom.maxZoom, model.locked)}
        <div class="web-inspector-actions">
          <button
            type="button"
            class="btn btn-secondary"
            title="${recorded ? 'Writes transform keyframes' : 'Record the clip first'}"
            disabled="${!recorded || model.locked || working}"
            onclick="${on.handleZoom}"
          >
            <app-icon name="zoom-in" size="sm"></app-icon> Zoom in on clicks and focus steps
          </button>
          <button
            type="button"
            class="btn btn-ghost"
            disabled="${!hasZoom(clip) || model.locked}"
            onclick="${on.handleRemoveZoom}"
          >
            Remove zoom
          </button>
        </div>
        ${message && html`<p class="error-message" role="alert">${message}</p>`}
      `;
    },
    shadow: false,
  },
});
