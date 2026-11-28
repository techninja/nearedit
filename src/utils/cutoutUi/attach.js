/**
 * A finished cutout enters the document: attached to every clip it covers,
 * without an undo step of its own — a finished job is not something a
 * person did, so undo steps over it and redo keeps it. Cutouts finished by
 * jobs this page did not start (another tab, the director) are attached the
 * same way.
 * @module utils/cutoutUi/attach
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { attachCutout } from '#utils/edl/index.js';
import { commit, getDoc, inGesture } from '#utils/editor/session.js';
import { onJobFinished } from '#utils/ui/jobCenter.js';
import { followed } from './request.js';

const RETRY_MS = 120;

/**
 * Attach a job's result to the clips waiting for it. A drag on the
 * timeline is let finish first: it works from the document it started with
 * and would throw the cutout away.
 * @param {any} made - `{ file, key, source, start, end, fps, width, height, frames }`
 * @returns {Promise<boolean>} Resolves once it is in the document; false
 *   when no clip took it
 */
export function attachWhenIdle(made) {
  return new Promise((resolve) => {
    const attempt = () => {
      if (inGesture()) return void setTimeout(attempt, RETRY_MS);
      resolve(commit(attachCutout(getDoc(), made), { record: false }));
    };
    attempt();
  });
}

/**
 * Attach the cutouts of `cutout` jobs of this project that finish, whoever
 * started them.
 * @returns {() => void} Stop
 */
export function watchCutoutJobs() {
  return onJobFinished((job) => {
    const { projectId } = store.get(ProjectState);
    if (job.type !== 'cutout' || job.status !== 'complete' || job.projectId !== projectId) return;
    if (followed.has(job.id)) return; // the lifecycle attaches its own
    const made = job.result || {};
    if (typeof made.file === 'string' && typeof made.source === 'string') attachWhenIdle(made);
  });
}
