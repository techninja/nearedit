/**
 * State of the web editor dialog: which clip it shows, which step is
 * selected, what the page view shows, and — on a narrow screen — which of
 * its three tabs is up. The recipe itself is never kept here: it lives in
 * the clip, in the edit session.
 * @module utils/webUi/editorState
 */

import { setAppState } from '#store/AppState.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { createObservable } from '#utils/ui/observable.js';
import { isWebClip } from '#utils/web/index.js';

/**
 * @typedef {Object} WebEditorState
 * @property {string} clipId - '' while the dialog is closed
 * @property {number} selected - The selected step; the number of steps
 *   means "the end": the page after every step
 * @property {'page'|'steps'|'timing'} tab - Narrow layout: the part that shows
 * @property {'page'|'recording'} mode - The page view shows the page as it
 *   is before the selected step, or plays the recording
 * @property {string} picking - The field of the selected step the next
 *   press on the page view fills in; '' when it adds a step instead
 * @property {{ x: number, y: number, pick: import('./pickActions.js').Pick }|null} menu -
 *   The menu of what was pressed on the page view
 */

/** @type {WebEditorState} */
const CLOSED = { clipId: '', selected: 0, tab: 'page', mode: 'page', picking: '', menu: null };

/** @type {import('#utils/ui/observable.js').Observable<WebEditorState>} */
export const webEditorState = createObservable({ ...CLOSED });

/**
 * @param {string} clipId
 * @returns {{ clip: any, track: any }|null} The clip when it is a web clip
 */
export function webClipOf(clipId) {
  const found = findClip(getDoc(), clipId);
  return found && isWebClip(found.clip) ? found : null;
}

/**
 * Open the web editor for a clip, on the end of its steps: the page as
 * the recording leaves it, ready for the next step.
 * @param {string} clipId
 * @returns {boolean} false when the clip is not a web clip
 */
export function openWebEditor(clipId) {
  const found = webClipOf(clipId);
  if (!found) return false;
  // The dialog is mounted in the dock, which a narrow screen hides while its sheet is closed.
  setAppState({ sheetOpen: true });
  webEditorState.set({ ...CLOSED, clipId, selected: found.clip.web.recipe.steps.length });
  return true;
}

/** Close the dialog. A recording that is under way carries on. */
export function closeWebEditor() {
  if (webEditorState.get().clipId) webEditorState.set({ ...CLOSED });
}

/**
 * Select a step (or the end), leaving the recording's playback.
 * @param {number} index
 */
export function selectStep(index) {
  const found = webClipOf(webEditorState.get().clipId);
  if (!found) return;
  const count = found.clip.web.recipe.steps.length;
  const selected = Math.max(0, Math.min(count, Math.round(index)));
  webEditorState.set({ selected, picking: '', menu: null });
}

/**
 * The selection as it can be shown: inside the steps there are now (an
 * undo may have taken some away).
 * @param {WebEditorState} state
 * @param {{ steps: any[] }} recipe
 * @returns {number}
 */
export const shownSelection = (state, recipe) =>
  Math.max(0, Math.min(recipe.steps.length, state.selected));
