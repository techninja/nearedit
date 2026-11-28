/**
 * How the web editor (`<web-editor>`) shows things: which tab is up on a
 * narrow screen, whether the page view shows the page or plays the
 * recording, where the recording's playhead is, the keys of the dialog —
 * and, after every change, asking for the picture of the page as it is
 * before the selected step.
 * @module utils/webUi/editorView
 */

import { redo, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { stepAtTime, stripBlocks } from './scoreStrip.js';
import { closeWebEditor, shownSelection, webClipOf, webEditorState } from './editorState.js';
import { resetSnapshots, showSnapshot } from './snapshot.js';

/**
 * @typedef {Object} WebEditorHost
 * @property {import('./editorState.js').WebEditorState} state
 * @property {any} doc - The open document
 * @property {import('./snapshot.js').SnapshotState} snap
 * @property {{ byClip: Record<string, import('./clipStatus.js').RecordingProgress> }} recordings
 * @property {import('./captureStatus.js').CaptureState} capture
 * @property {number} playhead - Seconds of the recording being played; -1 = none
 * @property {{ time: number, n: number }} seek - Where the recording should jump to
 * @property {boolean} listOpen - The element list shows beside the page
 * @property {boolean} services - Internal: follows recordings while connected
 */

/** @typedef {WebEditorHost & HTMLElement} Host */

/** The three parts a narrow screen shows one at a time. */
export const TABS = [
  { id: 'page', label: 'Page', icon: 'web' },
  { id: 'steps', label: 'Steps', icon: 'list' },
  { id: 'timing', label: 'Timing', icon: 'timer' },
];

/** @param {Host} _host @param {CustomEvent} event */
export function handleTab(_host, event) {
  webEditorState.set({ tab: event.detail.id });
}

/** "Page" or "Recording" above the page view. @param {Host} host @param {Event} event */
export function handleMode(host, event) {
  const { mode } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  webEditorState.set({ mode: /** @type {'page'|'recording'} */ (mode), picking: '', menu: null });
  if (mode === 'page') host.playhead = -1;
}

/** @param {Host} host */
export function handleListToggle(host) {
  host.listOpen = !host.listOpen;
}

/** The recording reports where it is. @param {Host} host @param {CustomEvent} event */
export function handleTime(host, event) {
  host.playhead = event.detail.time;
}

/**
 * The ruler of the score strip was pressed: the recording goes there, and
 * the step that plays at that moment becomes the selected one.
 * @param {Host} host
 * @param {CustomEvent} event
 */
export function handleSeek(host, event) {
  const { time } = event.detail;
  const found = webClipOf(webEditorState.get().clipId);
  if (!found) return;
  const { blocks } = stripBlocks(found.clip.web.recipe, host.doc.fps || 30);
  const index = stepAtTime(blocks, time);
  webEditorState.set({ mode: 'recording', ...(index >= 0 && { selected: index }) });
  host.seek = { time, n: host.seek.n + 1 };
  host.playhead = time;
}

/**
 * Keys anywhere in the dialog: Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z (or
 * Ctrl+Y) redoes — the editor's own shortcuts are behind the dialog —
 * except in a text box, which has its own undo. Escape first puts down a
 * target being picked.
 * @param {Host} _host
 * @param {KeyboardEvent} event
 */
export function handleKeys(_host, event) {
  if (event.key === 'Escape' && webEditorState.get().picking) {
    event.stopPropagation();
    return void webEditorState.set({ picking: '' });
  }
  const key = event.key.toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || event.altKey || (key !== 'z' && key !== 'y')) return;
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.matches?.('input:not([type="checkbox"]), textarea')) return;
  event.preventDefault();
  finishEdit();
  if (key === 'y' || event.shiftKey) redo();
  else undo();
}

/** Escape in the pick menu closes the menu, not the dialog. @param {Host} _host @param {KeyboardEvent} event */
export function handleMenuKeys(_host, event) {
  if (event.key === 'Escape') event.stopPropagation();
}

/**
 * After every render: close when the clip is gone (deleted, undone), and
 * ask for the page as it stands before the selected step.
 * @param {Host} host
 */
export function sync(host) {
  const { clipId, mode } = host.state;
  if (!clipId) return;
  const found = webClipOf(clipId);
  if (!found) {
    closeWebEditor();
    return void resetSnapshots();
  }
  const { recipe } = found.clip.web;
  if (mode === 'page') showSnapshot(recipe, shownSelection(host.state, recipe));
}
