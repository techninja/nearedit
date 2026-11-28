/**
 * Export dialog organism — render the timeline to a video file: pick a
 * preset and a range, see what will be rendered, start, watch progress
 * (cancel any time), then download or open the result. Web clips that are
 * not recorded, or out of date, are pointed out first. Opened with the
 * `open` property; announces `close`. State: `#utils/ui/exportController.js`.
 * @module components/organisms/export-dialog
 */

import { html, define, dispatch } from 'hybrids';
import { currentRanges, exportState, openExport } from '#utils/ui/exportController.js';
import { setExportOption } from '#utils/ui/exportController.js';
import { filenameProblem } from '#utils/ui/exportPlan.js';
import { cancelExport, startExport } from '#utils/ui/exportRun.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import { exportBody } from '#utils/ui/exportViews.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { webExportNote } from '#utils/webUi/exportNote.js';
import { recordingState } from '#utils/webUi/recording.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';
import '#molecules/export-options/index.js';

/**
 * @typedef {Object} ExportDialogHost
 * @property {boolean} open
 * @property {import('#utils/ui/exportController.js').ExportState} state
 * @property {any} doc - The open document (for the note about web clips)
 * @property {{ byClip: Record<string, any> }} recordings - Web clips being recorded
 */

/** @param {ExportDialogHost & HTMLElement} host */
function handleClose(host) {
  host.open = false;
  dispatch(host, 'close');
}

/** @param {ExportDialogHost} _host @param {CustomEvent} event */
function handleField(_host, event) {
  setExportOption(event.detail.key, event.detail.value);
}

/** @param {ExportDialogHost} _host @param {boolean} open */
function handleOpenChange(_host, open) {
  if (open) openExport();
}

/**
 * @param {import('#utils/ui/exportController.js').ExportState} state
 * @returns {import('hybrids').UpdateFunctionWithMethods<ExportDialogHost>}
 */
function footer(state) {
  if (state.job || state.starting)
    return html`
      <span class="app-dialog-note">Closing this window does not stop the render.</span>
      <button type="button" class="btn btn-secondary" onclick="${cancelExport}">
        Cancel render
      </button>
      <button type="button" class="btn btn-primary" onclick="${handleClose}">Hide</button>
    `;
  if (state.result)
    return html`<button type="button" class="btn btn-secondary" onclick="${handleClose}">
      Close
    </button>`;
  const blocked = !state.plan || Boolean(state.planError || filenameProblem(state.filename));
  return html`
    <button type="button" class="btn btn-secondary" onclick="${handleClose}">Cancel</button>
    <button
      type="button"
      class="btn btn-primary export-dialog-start"
      disabled="${blocked}"
      onclick="${startExport}"
    >
      <app-icon name="export" size="sm"></app-icon> Export
    </button>
  `;
}

/** @type {import('hybrids').Component<ExportDialogHost>} */
export default define({
  tag: 'export-dialog',
  open: { value: false, observe: handleOpenChange },
  state: watch(exportState),
  doc: liveDoc(),
  recordings: watch(recordingState),
  render: {
    value: ({ open, state, doc, recordings }) =>
      open
        ? html`<app-dialog open onclose="${handleClose}" onfieldchange="${handleField}">
            ${dialogFrame({
              title: 'Export video',
              body: exportBody(state, currentRanges(), webExportNote(doc, recordings)),
              footer: footer(state),
              onClose: handleClose,
            })}
          </app-dialog>`
        : html``,
    shadow: false,
  },
});
