/**
 * What the export dialog shows about subtitles once a render is done: the
 * file that was saved beside the video, with a way to get it — and
 * anything the render could not honour (a captioned clip whose file has no
 * transcript, subtitles asked for with no words to write).
 * @module utils/captionsUi/exportParts
 */

import { html } from 'hybrids';

/**
 * @param {any} result - Result of a render job, or null while there is none
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>} Nothing when
 *   the render saved no subtitle file and has nothing to say
 */
export function subtitleResult(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (!result || (!result.subtitlesUrl && !warnings.length)) return html``;
  return html`<div class="export-dialog-subtitles">
    ${result.subtitlesUrl
      ? html`<p class="export-dialog-subtitle-file">
          <app-icon name="captions" size="sm"></app-icon>
          <span>Subtitles saved beside it:</span>
          <strong class="export-dialog-file">${result.subtitles}</strong>
          <a class="btn btn-secondary" href="${`${result.subtitlesUrl}?download`}" download>
            <app-icon name="export" size="sm"></app-icon> Download subtitles
          </a>
        </p>`
      : html``}
    ${warnings.length
      ? html`<ul class="export-dialog-warnings">
          ${warnings.map((/** @type {string} */ warning) => html`<li>${warning}</li>`)}
        </ul>`
      : html``}
  </div>`;
}
