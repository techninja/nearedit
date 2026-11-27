/**
 * The director's run history for the session: what each run did, and how
 * it can be taken back. Pure — documents are compared by reference, as the
 * edit session never mutates one.
 * @module utils/directorUi/history
 */

/**
 * @typedef {Object} RunRecord
 * @property {number} id
 * @property {string} title - Action title
 * @property {string} where - The mode, in words
 * @property {string} summary
 * @property {string[]} notes
 * @property {number} time - Epoch milliseconds
 * @property {any} before - The document before the run
 * @property {any} after - The document the run produced
 * @property {boolean} undone
 */

const LIMIT = 8;

/**
 * Add a run, newest first, keeping the list short.
 * @param {RunRecord[]} history
 * @param {RunRecord} record
 * @returns {RunRecord[]}
 */
export function addRun(history, record) {
  return [record, ...history].slice(0, LIMIT);
}

/**
 * How a run can be taken back right now.
 * - `undo`: nothing changed since — a plain undo of the last step.
 * - `revert`: the timeline moved on; the document from before the run can
 *   be restored as a new step (which Undo can take back in turn).
 * - `none`: already undone.
 * @param {RunRecord} record
 * @param {any} currentDoc
 * @returns {'undo'|'revert'|'none'}
 */
export function undoKind(record, currentDoc) {
  if (record.undone || currentDoc === record.before) return 'none';
  return currentDoc === record.after ? 'undo' : 'revert';
}

/**
 * @param {RunRecord[]} history
 * @param {number} id
 * @returns {RunRecord[]}
 */
export function markUndone(history, id) {
  return history.map((record) => (record.id === id ? { ...record, undone: true } : record));
}

/**
 * Runs whose result is no longer on the timeline (the user undid past
 * them) are shown as undone; a redo brings them back.
 * @param {RunRecord[]} history
 * @param {any} currentDoc
 * @returns {RunRecord[]} The same array when nothing changed
 */
export function syncHistory(history, currentDoc) {
  let changed = false;
  const next = history.map((record) => {
    const undone =
      currentDoc === record.before ? true : currentDoc === record.after ? false : record.undone;
    if (undone === record.undone) return record;
    changed = true;
    return { ...record, undone };
  });
  return changed ? next : history;
}
