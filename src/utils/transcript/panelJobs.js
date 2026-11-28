/**
 * The transcript panel's talks with the server: transcribing the file on
 * screen as a background job with live progress, and saving a corrected
 * word back to its sidecar. These act on the `<transcript-panel>` host.
 * The job itself is the editor's one transcription of a file
 * (`#utils/captionsUi/transcribe.js`): started here or from the inspector's
 * Captions group, both show the same progress.
 * @module utils/transcript/panelJobs
 */

import { cancelTranscribe, transcribeFile } from '#utils/captionsUi/transcribe.js';
import { saveSidecar } from '#utils/media/sidecars.js';
import { correctionPatch } from './correct.js';
import { panelContext } from './panelContext.js';

/** @typedef {import('./panelContext.js').Host} Host */

/** @param {Host} host - `transcript-transcribe` */
export function handleTranscribe(host) {
  host.message = '';
  void transcribeFile(host.file);
}

/** @param {Host} host - `transcript-cancel` */
export function handleCancelTranscribe(host) {
  cancelTranscribe(host.file);
}

/**
 * `transcript-correct`: save a corrected word back to the sidecar.
 * @param {Host} host
 * @param {CustomEvent} event
 */
export function handleCorrect(host, event) {
  const { units, level } = panelContext(host);
  const patch = correctionPatch(host.sidecar, units[event.detail.index], level, event.detail.text);
  host.editing = -1;
  if (!patch) return;
  saveSidecar(host.file, patch)
    .then(() => (host.message = 'Correction saved'))
    .catch((err) => (host.message = `The correction could not be saved: ${err.message}`));
}
