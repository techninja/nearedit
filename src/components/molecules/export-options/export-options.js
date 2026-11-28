/**
 * Export options molecule — quality preset, what part of the timeline, the
 * file name, and whether the captions are also saved as a subtitle file
 * beside the video. Announces `fieldchange` with `detail: { key, value }`
 * (keys: preset, rangeId, filename, subtitles).
 * @module components/molecules/export-options
 */

import { html, define, dispatch } from 'hybrids';
import { captionedCount, subtitleOption } from '#utils/captionsUi/exportSubtitles.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { filenameProblem } from '#utils/ui/exportPlan.js';
import { watch } from '#utils/ui/observable.js';

/**
 * @typedef {Object} ExportOptionsHost
 * @property {{ id: string, label: string, description: string }[]} presets
 * @property {string} preset - Selected preset id
 * @property {import('#utils/ui/exportPlan.js').RangeChoice[]} ranges
 * @property {string} rangeId - Selected range id
 * @property {string} filename
 * @property {{ format: string }} subtitles - The subtitle file chosen: '', `srt` or `vtt`
 * @property {any} doc - The open document: without captions there is nothing to save
 */

/** The subtitle files a render can save beside its video. */
const SUBTITLES = [
  ['', 'None', ''],
  ['srt', '.srt', 'SubRip'],
  ['vtt', '.vtt', 'WebVTT'],
];

/** @param {ExportOptionsHost & HTMLElement} host @param {Event} event */
function handleChange(host, event) {
  const { name, value } = /** @type {HTMLInputElement} */ (event.target);
  dispatch(host, 'fieldchange', { detail: { key: name, value }, bubbles: true });
}

/** @type {import('hybrids').Component<ExportOptionsHost>} */
export default define({
  tag: 'export-options',
  presets: { value: [] },
  preset: '',
  ranges: { value: [] },
  rangeId: 'all',
  filename: '',
  subtitles: watch(subtitleOption),
  doc: liveDoc(),
  render: {
    value: ({ presets, preset, ranges, rangeId, filename, subtitles, doc }) => {
      // Without captions there is nothing to save: the choice is shown, not offered.
      const captioned = captionedCount(doc) > 0;
      return html`
        <fieldset class="export-options-group" onchange="${handleChange}">
          <legend>Quality</legend>
          ${presets.map(
            (option) => html`
              <label class="export-options-choice">
                <input
                  type="radio"
                  name="preset"
                  value="${option.id}"
                  checked="${option.id === preset}"
                />
                <span>
                  <strong>${option.label}</strong>
                  <span class="export-options-hint">${option.description}</span>
                </span>
              </label>
            `,
          )}
        </fieldset>
        <fieldset class="export-options-group" onchange="${handleChange}">
          <legend>What to export</legend>
          ${ranges.map(
            (range) => html`
              <label class="export-options-choice ${range.available ? '' : 'export-options-off'}">
                <input
                  type="radio"
                  name="rangeId"
                  value="${range.id}"
                  checked="${range.id === rangeId}"
                  disabled="${!range.available}"
                />
                <span>
                  <strong>${range.label}</strong>
                  <span class="export-options-hint">${range.hint}</span>
                </span>
              </label>
            `,
          )}
        </fieldset>
        <label class="export-options-name">
          <span class="export-options-legend">File name</span>
          <span class="export-options-file">
            <input
              class="field-input"
              name="filename"
              maxlength="120"
              autocomplete="off"
              spellcheck="false"
              value="${filename}"
              oninput="${handleChange}"
            />
            <span class="export-options-ext">.mp4</span>
          </span>
          ${filenameProblem(filename)
            ? html`<span class="error-message" role="alert">${filenameProblem(filename)}</span>`
            : html`<span class="export-options-hint">
                Kept on the server; a number is added if the name is taken.
              </span>`}
        </label>
        <fieldset class="export-options-group" onchange="${handleChange}">
          <legend>Subtitle file</legend>
          <div class="export-options-row">
            ${SUBTITLES.map(
              ([value, label, hint]) => html`
                <label class="export-options-choice ${captioned ? '' : 'export-options-off'}">
                  <input
                    type="radio"
                    name="subtitles"
                    value="${value}"
                    checked="${value === (captioned ? subtitles.format : '')}"
                    disabled="${!captioned}"
                  />
                  <span>
                    <strong>${label}</strong>
                    <span class="export-options-hint">${hint}</span>
                  </span>
                </label>
              `,
            )}
          </div>
          <span class="export-options-hint export-options-subtitles-hint">
            ${captioned
              ? 'The captions as phrases to read, saved beside the video under the same name.'
              : 'No captions are switched on — switch them on in Inspector ▸ Captions first.'}
          </span>
        </fieldset>
      `;
    },
    shadow: false,
  },
});
