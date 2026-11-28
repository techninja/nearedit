/**
 * What the inspector's Captions group does when its controls are used:
 * the switch, "Transcribe" (which also switches captions on, so they show
 * the moment the transcript is there), "Cancel", "Edit words" and the fold
 * that holds the style. These act on the `<captions-inspector>` host.
 * @module utils/captionsUi/clipEvents
 */

import { getDoc } from '#utils/editor/session.js';
import { switchCaptions, transcribeAndCaption } from './actions.js';
import { captionSubject } from './clipSubject.js';
import { openWords, toggleStyleFold } from './styleView.js';
import { cancelTranscribe } from './transcribe.js';

/**
 * @typedef {Object} CaptionsInspectorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {number} words - Grows when a transcript arrives or changes
 * @property {import('./transcribe.js').TranscribeState} jobs
 * @property {import('./styleView.js').StyleView} view
 */

/** @typedef {CaptionsInspectorHost & HTMLElement} Host */

/**
 * The voices the group is about, read from the document as it is now.
 * @param {CaptionsInspectorHost} host
 * @returns {import('./clipSubject.js').CaptionSubject}
 */
export function subjectOf(host) {
  const ids = (host.model?.refs || []).map((ref) => ref.clip.clipId);
  return captionSubject(getDoc(), ids);
}

/** The switch. @param {Host} host @param {Event} event */
export function handleSwitch(host, event) {
  const { checked } = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  switchCaptions(subjectOf(host).ids, checked);
}

/** The button beside the state line. @param {Host} host @param {Event} event */
export function handleAction(host, event) {
  const { action } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const [voice] = subjectOf(host).voices;
  if (!voice?.info.file) return;
  if (action === 'cancel') cancelTranscribe(voice.info.file);
  else void transcribeAndCaption(voice.info.file, [voice.info.carrierId]);
}

/** "Edit words". @param {Host} host */
export function handleWords(host) {
  const [voice] = subjectOf(host).voices;
  if (voice?.info.file) openWords(voice.info.file);
}

/** The fold that holds the style. */
export function handleFold() {
  toggleStyleFold();
}
