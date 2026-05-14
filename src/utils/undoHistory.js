/**
 * Undo/Redo history for the timeline EDL state.
 * Stores snapshots as JSON strings for instant rollback.
 * @module utils/undoHistory
 */

const MAX_HISTORY = 50;

/** @type {string[]} */
const past = [];
/** @type {string[]} */
const future = [];

/**
 * Push a state snapshot onto the undo stack.
 * @param {object} state
 */
export function pushState(state) {
  past.push(JSON.stringify(state));
  if (past.length > MAX_HISTORY) past.shift();
  future.length = 0;
}

/**
 * Undo — returns the previous state or null.
 * @param {object} current
 * @returns {object|null}
 */
export function undo(current) {
  if (!past.length) return null;
  future.push(JSON.stringify(current));
  return JSON.parse(past.pop());
}

/**
 * Redo — returns the next state or null.
 * @param {object} current
 * @returns {object|null}
 */
export function redo(current) {
  if (!future.length) return null;
  past.push(JSON.stringify(current));
  return JSON.parse(future.pop());
}

/** @returns {boolean} */
export function canUndo() { return past.length > 0; }

/** @returns {boolean} */
export function canRedo() { return future.length > 0; }
