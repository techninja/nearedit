/**
 * The export dialog's subtitle option: none, `.srt` or `.vtt` — a render
 * then saves the timeline's captions beside the video, as phrases to read
 * (the render job's `subtitles`, docs/app-spec/CAPTIONS.md § In a render).
 * The choice is remembered on this computer. A render started here carries
 * it; everything else about a render is `#utils/ui/exportRun.js`'s.
 * @module utils/captionsUi/exportSubtitles
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { setUserPrefs } from '#store/UserPrefs.js';
import { runJob } from '#utils/api/jobs.js';
import { saveNow } from '#utils/editor/project.js';
import { getDoc } from '#utils/editor/session.js';
import { captionedClips } from '#utils/edl/index.js';
import { exportRequest, exportState } from '#utils/ui/exportController.js';
import { noteLongJobStarted } from '#utils/ui/notify.js';
import { createObservable } from '#utils/ui/observable.js';
import { readStored, writeStored } from '#utils/ui/storage.js';

const STORE_KEY = 'nearedit_captions';
export const SUBTITLE_CHOICES = ['', 'srt', 'vtt'];

/** @type {(format: unknown) => string} A known choice; '' for anything else */
const known = (format) =>
  typeof format === 'string' && SUBTITLE_CHOICES.includes(format) ? format : '';

/** @type {import('#utils/ui/observable.js').Observable<{ format: string }>} */
export const subtitleOption = createObservable({
  format: known(readStored(STORE_KEY).exportSubtitles),
});

/**
 * Choose the subtitle file a render saves.
 * @param {string} format - '', `srt` or `vtt`
 */
export function setSubtitleFormat(format) {
  subtitleOption.set({ format: known(format) });
  writeStored(STORE_KEY, { ...readStored(STORE_KEY), exportSubtitles: known(format) });
}

/**
 * @param {any} doc
 * @returns {number} How many voices of a document have captions switched on
 */
export const captionedCount = (doc) => captionedClips(doc).length;

/**
 * The request of a render with the subtitle option in it.
 * @param {Record<string, any>} request - `exportRequest()`
 * @param {string} format - The choice
 * @param {number} captioned - Voices with captions on: without any, no file is asked for
 * @returns {Record<string, any>}
 */
export function withSubtitles(request, format, captioned) {
  return known(format) && captioned > 0 ? { ...request, subtitles: known(format) } : request;
}

/** @type {AbortController|null} */
let running = null;

/**
 * Save the document, start the render — with the subtitle file when one
 * was chosen — and follow it to the end. The steps are those of
 * `startExport` in `#utils/ui/exportRun.js`; only the request differs.
 */
export async function startExport() {
  if (exportState.get().job || exportState.get().starting) return;
  const { adaptationId } = exportState.get();
  const mine = () => exportState.get().adaptationId === adaptationId;
  exportState.set({ starting: true, error: '', result: null, saveWarning: '' });
  noteLongJobStarted();
  if (store.get(ProjectState).dirty) await saveNow();
  const { saveError } = store.get(ProjectState);
  const saveWarning = saveError ? `The project could not be saved first (${saveError}).` : '';
  const controller = new AbortController();
  running = controller;
  const request = withSubtitles(
    exportRequest(),
    subtitleOption.get().format,
    captionedCount(getDoc()),
  );
  try {
    const result = await runJob('/render', request, {
      signal: controller.signal,
      onUpdate: (job) => mine() && exportState.set({ job, starting: false, saveWarning }),
    });
    setUserPrefs({ exportPreset: exportState.get().preset });
    if (mine()) exportState.set({ job: null, starting: false, result });
  } catch (err) {
    const cancelled = err.message === 'Cancelled';
    const error = cancelled ? '' : [err.message, err.body?.detail].filter(Boolean).join(' — ');
    if (mine()) exportState.set({ job: null, starting: false, error });
  } finally {
    if (running === controller) running = null;
  }
}

/** Cancel the running render. */
export function cancelExport() {
  running?.abort();
}
