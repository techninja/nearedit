/**
 * The transcript panel's talks with the server: transcribing the file on
 * screen as a background job with live progress, and saving a corrected
 * word back to its sidecar. These act on the `<transcript-panel>` host.
 * @module utils/transcript/panelJobs
 */

import { transcribeMedia } from '#utils/media/analyze.js';
import { forgetSidecars, saveSidecar } from '#utils/media/sidecars.js';
import { correctionPatch } from './correct.js';
import { panelContext } from './panelContext.js';

/** @typedef {import('./panelContext.js').Host} Host */

/** @type {AbortController|null} */
let transcribing = null;

/** @param {Host} host - `transcript-transcribe` */
export function handleTranscribe(host) {
  const file = host.file;
  transcribing = new AbortController();
  Object.assign(host, {
    job: { active: true, label: 'Starting transcription…', progress: 0 },
    message: '',
  });
  transcribeMedia(file, {
    signal: transcribing.signal,
    onUpdate: ({ label, progress, log }) =>
      host.file === file &&
      (host.job = { active: true, label, progress, detail: log?.[log.length - 1] || '' }),
  })
    .then(() => forgetSidecars(file))
    .catch((err) => (host.message = [err.message, err.body?.detail].filter(Boolean).join(' — ')))
    .finally(() => (host.job = {}));
}

/** `transcript-cancel` */
export function handleCancelTranscribe() {
  transcribing?.abort();
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
