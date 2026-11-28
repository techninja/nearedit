/**
 * Edit session — the one holder of the document and the one door every
 * change to it goes through.
 *
 * The document is a plain object, kept exactly as operations return it, so
 * tracks and clips may carry any data. Read with `getDoc()`, write with
 * `edit()` / `commit()`. The store never holds it: after a change the
 * mirror writes a summary to `TimelineState`, which nothing else may write.
 *
 * Undo history holds document references: operations never mutate.
 * @module utils/editor/session
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createEdl } from '#utils/edl/factory.js';
import { createHistory } from '#utils/edl/history.js';
import { flushMirror, mirrorNow, mirrorSoon } from '#utils/editor/mirror.js';

/** @typedef {{ transient: boolean, reason: 'edit'|'undo'|'redo'|'load'|'gesture'|'amend' }} ChangeInfo */

/** @type {any} */
let doc = createEdl();
/** @type {any|null} Document as it was when the current gesture began */
let gestureBase = null;
const history = createHistory({ limit: 200 });
/** @type {Set<(doc: any, info: ChangeInfo) => void>} */
const listeners = new Set();

/** @returns {any} The current EDL document (plain object, never mutate it) */
export const getDoc = () => doc;

/**
 * Make a document current and tell everyone.
 * @param {any} next
 * @param {ChangeInfo} info
 */
function publish(next, info) {
  doc = next;
  if (info.transient) mirrorSoon(next);
  else mirrorNow(next);
  for (const listener of listeners) listener(doc, info);
}

/** Drop selected ids that no longer exist (after undo, delete, load). */
function pruneSelection() {
  const selection = store.get(ViewState).selection || [];
  if (!selection.length) return;
  const alive = new Set(doc.tracks.flatMap((t) => t.clips.map((c) => c.clipId)));
  const kept = selection.filter((id) => alive.has(id));
  if (kept.length !== selection.length) store.set(ViewState, { selection: kept });
}

/**
 * Replace the whole document (opening an adaptation). Clears undo history.
 * @param {any} next - A normalised v2 EDL
 */
export function loadDoc(next) {
  history.clear();
  gestureBase = null;
  publish(next, { transient: false, reason: 'load' });
  pruneSelection();
}

/**
 * Store a new document as one undoable step.
 * @param {any} next - Result of a pure operation on `getDoc()`
 * @param {{ record?: boolean }} [opts] - `record: false` amends: no undo step, redo is kept
 * @returns {boolean} false when nothing changed
 */
export function commit(next, { record = true } = {}) {
  if (!next || next === doc) return false;
  if (gestureBase === null && record) history.push(doc);
  publish(next, { transient: gestureBase !== null, reason: record ? 'edit' : 'amend' });
  pruneSelection();
  return true;
}

/**
 * Apply a pure operation to the current document as one undoable step.
 * @param {(doc: any) => any} operation
 * @returns {boolean} false when nothing changed
 */
export const edit = (operation) => commit(operation(doc));

/**
 * Start a drag: every `commit`/`edit` until `endGesture` is a live preview,
 * and the whole gesture becomes a single undo step.
 * @returns {any} The document the gesture starts from — compute each
 *   pointer-move result from this, not from the previous preview
 */
export function beginGesture() {
  if (gestureBase === null) gestureBase = doc;
  return gestureBase;
}

/**
 * Finish a drag, recording one undo step when the document changed.
 * @returns {boolean} true when the gesture changed the document
 */
export function endGesture() {
  const base = gestureBase;
  gestureBase = null;
  flushMirror();
  if (base === null || base === doc) return false;
  history.push(base);
  for (const listener of listeners) listener(doc, { transient: false, reason: 'gesture' });
  return true;
}

/** Abandon a drag and restore the document it started from. */
export function cancelGesture() {
  const base = gestureBase;
  gestureBase = null;
  if (base !== null && base !== doc) publish(base, { transient: false, reason: 'gesture' });
}

/** @returns {boolean} true while a gesture is in progress */
export const inGesture = () => gestureBase !== null;

/** @returns {boolean} false when there was nothing to undo */
export function undo() {
  const previous = gestureBase === null ? history.undo(doc) : null;
  if (!previous) return false;
  publish(previous, { transient: false, reason: 'undo' });
  pruneSelection();
  return true;
}

/** @returns {boolean} false when there was nothing to redo */
export function redo() {
  const next = gestureBase === null ? history.redo(doc) : null;
  if (!next) return false;
  publish(next, { transient: false, reason: 'redo' });
  pruneSelection();
  return true;
}

export const canUndo = () => history.canUndo();
export const canRedo = () => history.canRedo();

/**
 * Observe document changes (autosave, dirty flags).
 * @param {(doc: any, info: ChangeInfo) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onDocChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
