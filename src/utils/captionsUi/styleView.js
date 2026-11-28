/**
 * Where the caption style is on screen. The style of a timeline is edited
 * in the inspector: in the document's view when nothing is selected, and
 * folded away under the Captions group of a selected clip. This holds
 * whether that fold is open, and lets any part of the editor ask for the
 * style to be shown ("Style…" in a message, the command).
 * @module utils/captionsUi/styleView
 */

import { setAppState } from '#store/AppState.js';
import { getDoc } from '#utils/editor/session.js';
import { clearSelection, getSelection } from '#utils/editor/view.js';
import { captionInfo } from '#utils/edl/index.js';
import { pinTranscript, pinnedTranscript } from '#utils/transcript/pin.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} StyleView
 * @property {boolean} open - The style is unfolded under a selected clip's captions
 * @property {number} asked - Counts requests to show the style; the style
 *   section on screen answers each once (`takeStyleRequest`)
 */

/** @type {import('#utils/ui/observable.js').Observable<StyleView>} */
export const styleView = createObservable({ open: false, asked: 0 });

/** The latest request a style section has answered. */
let answered = 0;

/**
 * Whether a request to show the style is waiting — asked once per request,
 * by the style section that is on screen (also one that has only just been
 * put there by the request).
 * @returns {boolean} True once for every `openCaptionStyle()`
 */
export function takeStyleRequest() {
  const { asked } = styleView.get();
  if (asked === answered) return false;
  answered = asked;
  return true;
}

/** Fold or unfold the style under a clip's captions. */
export function toggleStyleFold() {
  styleView.set({ open: !styleView.get().open });
}

/**
 * Show the caption style: bring the inspector forward and unfold the
 * style. A selection that has nothing to do with captions (a title, a
 * generator) is dropped, so the inspector shows the document.
 */
export function openCaptionStyle() {
  const doc = getDoc();
  const captionable = getSelection().some((clipId) => captionInfo(doc, clipId).can);
  if (!captionable) clearSelection();
  setAppState({ dockTab: 'inspector', sheetOpen: true });
  styleView.set({ open: true, asked: styleView.get().asked + 1 });
}

/**
 * Show a file's words for editing: bring the transcript panel forward. The
 * panel follows the selection; when another file is pinned there, this one
 * takes its place.
 * @param {string} file
 */
export function openWords(file) {
  if (pinnedTranscript() && pinnedTranscript() !== file) pinTranscript(file);
  setAppState({ dockTab: 'transcript', sheetOpen: true });
}
