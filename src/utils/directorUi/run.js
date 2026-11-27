/**
 * Running the director: post the directive with the timeline on screen
 * and follow the job. Destructive placements ask first. What happens with
 * the result is in `apply.js`.
 * @module utils/directorUi/run
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { runJob } from '#utils/api/jobs.js';
import { getDoc } from '#utils/editor/session.js';
import { isPlaying } from '#utils/playback/transport.js';
import { directorContext, directorRange } from '#utils/directorUi/context.js';
import { currentModes, refreshLlm } from '#utils/directorUi/controller.js';
import { buildDirective, fieldProblems, usesLlm } from '#utils/directorUi/form.js';
import { applyResult } from '#utils/directorUi/apply.js';
import { destructiveQuestion } from '#utils/directorUi/modes.js';
import { openScriptReview } from '#utils/directorUi/scripts.js';
import { currentAction, directorState } from '#utils/directorUi/state.js';
import { confirmAction } from '#utils/ui/confirm.js';
import { noteLongJobStarted } from '#utils/ui/notify.js';

/** @type {AbortController|null} */
let running = null;

/**
 * Run a directive.
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @param {{ mode: string, prompt: string, values: Record<string, any> }} form
 * @returns {Promise<void>}
 */
export async function runDirective(action, form) {
  if (running) return;
  const { projectId, adaptationId } = store.get(ProjectState);
  const view = store.get(ViewState);
  const posted = getDoc();
  const range = directorRange(view, posted);
  const question = destructiveQuestion(action, form.mode, posted, range);
  if (question && !(await confirmAction(question))) return;

  const context = directorContext(view, posted, isPlaying());
  const directive = buildDirective({ action, ...form, context });
  const where = currentModes(action).find((choice) => choice.id === form.mode)?.label || '';
  const controller = new AbortController();
  running = controller;
  const progress = { title: action.title, progress: 0, log: [], cancelling: false };
  directorState.set({ run: progress, error: null, result: null, problems: {} });
  if (usesLlm(action, form.values)) noteLongJobStarted();
  try {
    const body = { projectId, adaptationId, directive, edl: posted };
    const result = await runJob(
      action.jobType === 'script' ? '/director/script' : '/director',
      body,
      {
        signal: controller.signal,
        onUpdate: (job) => {
          const { run } = directorState.get();
          if (run) directorState.set({ run: { ...run, progress: job.progress, log: job.log } });
        },
      },
    );
    if (Array.isArray(result.scripts)) openScriptReview(result);
    else await applyResult(action, result, posted, where);
  } catch (err) {
    if (err.message !== 'Cancelled') {
      const error = { message: err.message, detail: err.body?.detail || '' };
      directorState.set({ error, problems: fieldProblems(err.body?.fields) });
      if (err.status === 503) refreshLlm();
    }
  } finally {
    running = null;
    directorState.set({ run: null });
  }
}

/** Run the open form. @returns {Promise<void>} */
export function runForm() {
  const action = currentAction();
  if (!action) return Promise.resolve();
  const { mode, prompt, values } = directorState.get();
  return runDirective(action, { mode, prompt, values });
}

/** Cancel the running job. */
export function cancelRun() {
  const { run } = directorState.get();
  if (!running || !run) return;
  directorState.set({ run: { ...run, cancelling: true } });
  running.abort();
}
