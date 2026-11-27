/**
 * Undo / redo history. Stores references, never copies: documents are
 * immutable, so keeping the previous one is all an undo step needs.
 * Generic — it works for any value. Isomorphic.
 * @module utils/edl/history
 */

/**
 * @template T
 * @typedef {Object} History
 * @property {(state: T) => void} push - Record the state an edit is about
 *   to replace. Clears the redo stack. Pushing the state already on top is
 *   ignored, so a drag may push on every pointer move.
 * @property {(current: T) => T|null} undo - Returns the previous state and
 *   keeps `current` for redo; null when there is nothing to undo
 * @property {(current: T) => T|null} redo - Returns the next state and keeps
 *   `current` for undo; null when there is nothing to redo
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {() => void} clear
 * @property {() => { undo: number, redo: number }} size
 */

/**
 * Create a history stack.
 *
 * Usage: `history.push(doc); doc = moveClips(doc, …)`, then
 * `doc = history.undo(doc) ?? doc` and `doc = history.redo(doc) ?? doc`.
 * @template T
 * @param {{ limit?: number }} [opts] - `limit`: undo steps kept (default 100)
 * @returns {History<T>}
 */
export function createHistory(opts = {}) {
  const limit = opts.limit > 0 ? Math.floor(opts.limit) : 100;
  /** @type {T[]} */
  let past = [];
  /** @type {T[]} */
  let future = [];
  const remember = (state) => {
    past.push(state);
    if (past.length > limit) past.shift();
  };
  return {
    push(state) {
      if (past.length && past[past.length - 1] === state) return;
      remember(state);
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      remember(current);
      return future.pop();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past = [];
      future = [];
    },
    size: () => ({ undo: past.length, redo: future.length }),
  };
}
