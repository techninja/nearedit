/**
 * Putting a director result on the timeline — always as one undo step —
 * and taking a run back. Nothing is applied silently over edits made
 * while the job ran.
 * @module utils/directorUi/apply
 */

import { applyDirected } from '#utils/director/applyResult.js';
import { commit, getDoc, undo } from '#utils/editor/session.js';
import { addRun, markUndone, undoKind } from '#utils/directorUi/history.js';
import { directorState } from '#utils/directorUi/state.js';
import { confirmAction } from '#utils/ui/confirm.js';

let nextRunId = 1;

/**
 * Merge a DirectorResult and remember the run.
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @param {any} result
 * @param {any} posted - The document the director worked from
 * @param {string} where - The mode, in words
 */
export async function applyResult(action, result, posted, where) {
  const before = getDoc();
  // In-place results and whole-timeline replacements were computed from
  // the posted document: applying them drops whatever changed meanwhile.
  const overwrites = action.inPlace || result.mode === 'replace';
  if (before !== posted && overwrites) {
    const sure = await confirmAction({
      title: 'The timeline changed while the director was working',
      message: `Applying “${action.title}” now replaces the changes you made in the meantime. Undo brings them back.`,
      confirmLabel: 'Apply anyway',
    });
    if (!sure) return directorState.set({ result: null });
  }
  // Clips and markers, and what a result says about the document itself (the
  // caption style, font files) — one change, one undo step.
  const next = applyDirected(before, result);
  const { title, summary = '', notes = [] } = { title: action.title, ...result };
  // A pass that found nothing to change leaves no step to undo behind.
  if (next === before) return directorState.set({ result: { title, summary, notes } });
  commit(next);
  const record = {
    id: nextRunId++,
    title: action.title,
    where,
    summary,
    notes,
    time: Date.now(),
    before,
    after: getDoc(),
    undone: false,
  };
  const history = addRun(directorState.get().history, record);
  directorState.set({ result: { title, summary, notes }, history });
}

/**
 * Take a run back: a plain undo while its result is still the current
 * document, otherwise (after asking) restore the timeline from before it.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function undoRun(id) {
  const record = directorState.get().history.find((r) => r.id === id);
  if (!record) return;
  const kind = undoKind(record, getDoc());
  if (kind === 'undo') undo();
  else if (kind === 'revert') {
    const sure = await confirmAction({
      title: `Go back to before “${record.title}”?`,
      message:
        'The timeline is put back as it was before this run. Edits made since then are replaced too — Undo brings them back.',
      confirmLabel: 'Restore',
    });
    if (!sure) return;
    commit(record.before);
  } else return;
  directorState.set({ history: markUndone(directorState.get().history, id), result: null });
}
