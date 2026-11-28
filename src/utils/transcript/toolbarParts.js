/**
 * Parts of the transcript toolbar's template that stand on their own: the
 * find box and the export links.
 * @module utils/transcript/toolbarParts
 */

import { html } from 'hybrids';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** @param {string} path @param {string} format @returns {string} */
const exportUrl = (path, format) =>
  `/api/intelligence/transcript?path=${encodeURIComponent(path)}&format=${format}&download=1`;

/**
 * The find box, as a template of its own. hybrids looks for table markup
 * with a pattern that also takes `<transcript-…` for a `<tr>`, and what
 * follows such a tag in the same template makes compiling it slow — with
 * the toolbar's buttons after it, far too slow.
 * @param {string} query
 * @param {number} hitCount
 * @param {number} hitIndex
 * @param {boolean} disabled
 * @returns {Template}
 */
export const findBox = (query, hitCount, hitIndex, disabled) =>
  html`<transcript-find
    query="${query}"
    hitCount="${hitCount}"
    hitIndex="${hitIndex}"
    disabled="${disabled}"
  ></transcript-find>`;

/**
 * Links that download the transcript of a file as SRT, VTT or text.
 * @param {string} file - Absolute path
 * @returns {Template}
 */
export function exportLinks(file) {
  return html`<span
    class="toolbar-group transcript-toolbar-export"
    role="group"
    aria-label="Export"
  >
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
  </span>`;
}
