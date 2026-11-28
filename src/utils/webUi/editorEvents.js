/**
 * What the web editor (`<web-editor>`) does with the events its parts send
 * up: field changes, step edits and retiming go to the clip's recipe
 * through the edit session (`edits.js`). What a press on the page view
 * does is in `editorPicks.js`.
 * @module utils/webUi/editorEvents
 */

import { redo, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { closeWebEditor, selectStep, webClipOf, webEditorState } from './editorState.js';
import { editStep, retimeBlock, setField } from './edits.js';
import { addAndShow } from './editorPicks.js';
import { cancelRecording, recordClip } from './recording.js';
import { resetSnapshots, showSnapshot } from './snapshot.js';
import { blankStep } from './stepRows.js';

/** @typedef {import('./editorView.js').WebEditorHost & HTMLElement} Host */

/** @type {() => string} The clip the dialog shows */
const clipId = () => webEditorState.get().clipId;

/** Close the dialog, ending any edit under way. */
export function handleClose() {
  finishEdit();
  closeWebEditor();
  resetSnapshots();
}

/** A field of the top bar or of the step form changed. @param {Host} _host @param {CustomEvent} event */
export function handleFieldChange(_host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  setField(clipId(), name, value, phase, /** @type {Element} */ (event.target));
}

/** @param {Host} _host @param {CustomEvent} event */
export function handleSelect(_host, event) {
  finishEdit();
  selectStep(event.detail.index);
  webEditorState.set({ mode: 'page' });
}

/** A row's button or key: remove, duplicate or move a step. @param {Host} _host @param {CustomEvent} event */
export function handleStep(_host, event) {
  const { action, index, to } = event.detail;
  editStep(clipId(), action, index, to);
}

/** A kind was chosen in the "add a step" menu. @param {Host} _host @param {CustomEvent} event */
export function handleStepAdd(_host, event) {
  const step = blankStep(event.detail.do);
  if (step) addAndShow(step, true);
}

/** The end of a block of the score strip moved. @param {Host} _host @param {CustomEvent} event */
export function handleRetime(_host, event) {
  const { block, frames, phase } = event.detail;
  retimeBlock(clipId(), block, frames, phase, /** @type {Element} */ (event.target));
}

/** "Refresh view": load the page again. @param {Host} _host */
export function handleRefresh(_host) {
  const found = webClipOf(clipId());
  const { selected } = webEditorState.get();
  if (found) showSnapshot(found.clip.web.recipe, selected, { delay: 0, fresh: true });
}

/** Start recording the clip. */
export const handleRecord = () => {
  finishEdit();
  recordClip(clipId());
};

/** Cancel the recording under way. */
export const handleCancel = () => cancelRecording(clipId());

/** Undo, from the dialog's own button. */
export const handleUndo = () => {
  finishEdit();
  undo();
};

/** Redo, from the dialog's own button. */
export const handleRedo = () => {
  finishEdit();
  redo();
};
