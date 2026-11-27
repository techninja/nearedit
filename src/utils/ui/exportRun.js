/**
 * Running an export: save the document, start the render job, follow it
 * to its result. The render is a background job — closing the dialog (or
 * the tab) does not stop it; the job tray keeps showing it.
 * @module utils/ui/exportRun
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { setUserPrefs } from '#store/UserPrefs.js';
import { runJob } from '#utils/api/jobs.js';
import { saveNow } from '#utils/editor/project.js';
import { exportRequest, exportState, refreshPlan } from '#utils/ui/exportController.js';
import { noteLongJobStarted } from '#utils/ui/notify.js';

/** @type {AbortController|null} */
let running = null;

/** Save the document, start the render and follow it to the end. */
export async function startExport() {
  if (exportState.get().job || exportState.get().starting) return;
  const { adaptationId } = exportState.get();
  const mine = () => exportState.get().adaptationId === adaptationId;
  exportState.set({ starting: true, error: '', result: null, saveWarning: '' });
  noteLongJobStarted();
  // Save first, so the file on the server matches what was rendered. The
  // render itself is sent the document on screen either way.
  if (store.get(ProjectState).dirty) await saveNow();
  const { saveError } = store.get(ProjectState);
  const saveWarning = saveError ? `The project could not be saved first (${saveError}).` : '';
  const controller = new AbortController();
  running = controller;
  try {
    const result = await runJob('/render', exportRequest(), {
      signal: controller.signal,
      onUpdate: (job) => mine() && exportState.set({ job, starting: false, saveWarning }),
    });
    setUserPrefs({ exportPreset: exportState.get().preset });
    if (mine()) exportState.set({ job: null, starting: false, result });
  } catch (err) {
    const error =
      err.message === 'Cancelled'
        ? ''
        : [err.message, err.body?.detail].filter(Boolean).join(' — ');
    if (mine()) exportState.set({ job: null, starting: false, error });
  } finally {
    if (running === controller) running = null;
  }
}

/** Cancel the running render (FFmpeg is stopped, the partial file removed). */
export function cancelExport() {
  running?.abort();
}

/** Back to the options, to render again. */
export function exportAgain() {
  exportState.set({ result: null, error: '' });
  refreshPlan();
}
