/**
 * Transcript panel toolbar: which file's transcript is shown (follow the
 * selection, or pin a file from the library), find, remove silences, copy
 * and export as SRT, VTT or text. Holds no state — it reports with
 * bubbling events: `transcript-pin` (`{ path }`) and `transcript-tool`
 * (`{ tool: 'silence' | 'copy' }`); the find box reports by itself.
 * @module components/molecules/transcript-toolbar
 */

import { define, dispatch, html } from 'hybrids';
import '#atoms/app-icon/app-icon.js';
import '#molecules/transcript-find/transcript-find.js';

/**
 * @typedef {Object} TranscriptToolbarHost
 * @property {string} file - Path of the file shown, '' for none
 * @property {boolean} pinned - The file is pinned rather than following the selection
 * @property {{ filePath: string, filename: string }[]} files - Transcribed files to choose from
 * @property {boolean} ready - A transcript is on screen: tools are usable
 * @property {string} query
 * @property {number} hitCount - Number of search hits
 * @property {number} hitIndex - The hit being visited, -1 for none
 * @property {boolean} silence - The remove-silences form is open
 */

/** @typedef {TranscriptToolbarHost & HTMLElement} Host */

/** @param {string} path @returns {string} */
const baseName = (path) => path.split(/[\\/]/).pop();

/** @param {string} path @param {string} format @returns {string} */
const exportUrl = (path, format) =>
  `/api/intelligence/transcript?path=${encodeURIComponent(path)}&format=${format}&download=1`;

/** @param {Host} host @param {Event} event */
function handlePin(host, event) {
  const path = /** @type {HTMLSelectElement} */ (event.target).value;
  dispatch(host, 'transcript-pin', { detail: { path }, bubbles: true });
}

/** @param {Host} host @param {Event} event */
function handleTool(host, event) {
  const { tool } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'transcript-tool', { detail: { tool }, bubbles: true });
}

/** @type {import('hybrids').Component<TranscriptToolbarHost>} */
export default define({
  tag: 'transcript-toolbar',
  file: '',
  pinned: false,
  files: { value: [] },
  ready: false,
  query: '',
  hitCount: 0,
  hitIndex: -1,
  silence: false,
  render: {
    value: ({ file, pinned, files, ready, query, hitCount, hitIndex, silence }) => html`
      <select
        class="field-input transcript-toolbar-file"
        aria-label="Transcript of"
        title="Whose transcript to show"
        onchange="${handlePin}"
      >
        <option value="" selected="${!pinned}">
          ${file && !pinned ? `Selection: ${baseName(file)}` : 'Follow the selection'}
        </option>
        ${files.map(
          (item) =>
            html`<option value="${item.filePath}" selected="${pinned && item.filePath === file}">
              ${item.filename}
            </option>`,
        )}
        ${pinned &&
        !files.some((item) => item.filePath === file) &&
        html`<option value="${file}" selected>${baseName(file)}</option>`}
      </select>
      <transcript-find
        query="${query}"
        hitCount="${hitCount}"
        hitIndex="${hitIndex}"
        disabled="${!ready}"
      ></transcript-find>
      <span class="toolbar-group">
        <button
          type="button"
          class="icon-btn"
          data-tool="silence"
          aria-pressed="${silence ? 'true' : 'false'}"
          title="Remove silences from this clip"
          disabled="${!ready}"
          onclick="${handleTool}"
        >
          <app-icon name="ripple" size="sm"></app-icon> Silences
        </button>
        <button
          type="button"
          class="icon-btn"
          data-tool="copy"
          title="Copy the transcript (or the selected words) as text"
          aria-label="Copy text"
          disabled="${!ready}"
          onclick="${handleTool}"
        >
          <app-icon name="copy" size="sm"></app-icon>
        </button>
      </span>
      ${ready &&
      html`<span class="toolbar-group transcript-toolbar-export" role="group" aria-label="Export">
        <app-icon name="file-down" size="sm"></app-icon>
        ${['srt', 'vtt', 'txt'].map(
          (format) =>
            html`<a
              class="icon-btn"
              href="${exportUrl(file, format)}"
              download
              title="Export as .${format}"
              >${format.toUpperCase()}</a
            >`,
        )}
      </span>`}
    `,
    shadow: false,
  },
});
