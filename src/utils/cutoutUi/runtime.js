/**
 * The life of a cutout in the running editor: the lifecycle
 * (`lifecycle.js`) wired to the edit session, the server and the job list.
 * While the editor is open it watches the document and keeps the server
 * making what the clips with cutout on need; the inspector, the timeline
 * badge and the export dialog read `cutoutJobs` and call the few functions
 * here. Started by `<cutout-watch>`, which the editor page mounts.
 * @module utils/cutoutUi/runtime
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { cutoutNeeds } from '#utils/edl/index.js';
import { getDoc, inGesture, onDocChange } from '#utils/editor/session.js';
import { exportState, refreshPlan } from '#utils/ui/exportController.js';
import { notifyIfHidden } from '#utils/ui/notify.js';
import { showToast } from '#utils/ui/toast.js';
import { attachWhenIdle, watchCutoutJobs } from './attach.js';
import { available, checkAvailability } from './availability.js';
import { createLifecycle } from './lifecycle.js';
import { requestCutout } from './request.js';
import { cutoutJobs, fileName, noteFile, resetCutoutJobs } from './state.js';

/** How often `makeWaiting` looks whether everything has ended, ms. */
const SETTLE_MS = 250;

/** @type {ReturnType<typeof createLifecycle>|null} */
let lifecycle = null;

/**
 * The export dialog shows what a render would be; with a new cutout that
 * has just changed. (Only once the dialog has been opened for this
 * document, and not while it shows a render.)
 */
function refreshExport() {
  const { adaptationId, job, result } = exportState.get();
  if (adaptationId && adaptationId === store.get(ProjectState).adaptationId && !job && !result)
    refreshPlan();
}

/**
 * A cutout that took real time was made, or one failed: say so, also to a
 * person who is looking at another tab.
 * @param {{ path: string, made?: any, error?: string }} ended
 */
function announce({ path, made, error }) {
  const name = fileName(path);
  if (error) return void showToast({ kind: 'error', title: `No cutout of ${name}`, detail: error });
  refreshExport();
  if (!made || made.cached) return;
  showToast({ kind: 'success', title: 'Cutout ready', detail: name });
  notifyIfHidden({ title: 'NearEdit — Cutout ready', body: name, tag: `cutout:${path}` });
}

/**
 * Start keeping the open document's cutouts made.
 * @param {{ delay?: number }} [opts] - `delay`: how long the document must
 *   be quiet before it is looked at, ms (tests)
 * @returns {() => void} Stop: jobs under way carry on at the server and are
 *   found again when the editor is next opened
 */
export function startCutouts(opts = {}) {
  lifecycle?.stop();
  resetCutoutJobs();
  const mine = createLifecycle({
    needs: () => (store.get(ProjectState).projectId ? cutoutNeeds(getDoc()) : []),
    busy: inGesture,
    make: (need, watch) => requestCutout(store.get(ProjectState).projectId, need, watch),
    attach: (made) => attachWhenIdle(made).then(() => {}),
    ...{ available, note: noteFile, announce, delay: opts.delay },
  });
  lifecycle = mine;
  const stops = [onDocChange(() => mine.schedule()), watchCutoutJobs()];
  mine.schedule();
  return () => {
    for (const stop of stops) stop();
    mine.stop();
    if (lifecycle === mine) lifecycle = null;
  };
}

/** Stop making the cutout of a file. @param {string} path */
export const cancelCutout = (path) => lifecycle?.cancel(path);

/**
 * Ask again for what failed, was cancelled, or could not be made here. A
 * server that said it cannot make cutouts is first asked to look again.
 * @param {string} [path] - One media file; without it, everything held up
 * @returns {Promise<void>}
 */
export async function retryCutout(path) {
  const { availability } = cutoutJobs.get();
  if (availability.known && !availability.available)
    await checkAvailability(true).catch((err) => console.warn('[cutout] status failed:', err));
  lifecycle?.retry(path);
}

/**
 * Make every cutout the document still waits for — also what failed or was
 * cancelled — and tell when the last of them has ended, one way or another.
 * @returns {Promise<void>}
 */
export async function makeWaiting() {
  await retryCutout();
  const running = lifecycle;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (lifecycle === running && running && !running.idle()) return;
      clearInterval(timer);
      resolve(undefined);
    }, SETTLE_MS);
  });
}
