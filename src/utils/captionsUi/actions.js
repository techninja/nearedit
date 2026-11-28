/**
 * What the captions interface does to the document: switching captions on
 * and off for the selection or for one voice, "Caption all speech", and
 * transcribing a file so that its captions can show. Every change is one
 * undo step, made the moment it is asked for; words arrive later, from the
 * transcript, and are not part of the document.
 * @module utils/captionsUi/actions
 */

import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { captionAllSpeech, captionInfo, setCaptions } from '#utils/edl/index.js';
import { showToast } from '#utils/ui/toast.js';
import { openCaptionStyle } from './styleView.js';
import { captionSummary } from './summary.js';
import { transcribeFile } from './transcribe.js';
import { hasWords, wordBook } from './words.js';

/**
 * The selected clips that can have captions, and whether they have them.
 * @returns {{ ids: string[], on: boolean }} `on`: every one of them is switched on
 */
export function selectionCaptions() {
  const doc = getDoc();
  const infos = getSelection()
    .map((clipId) => captionInfo(doc, clipId))
    .filter((info) => info.can);
  return {
    ids: [...new Set(infos.map((info) => info.carrierId))],
    on: infos.length > 0 && infos.every((info) => info.on),
  };
}

/** @returns {boolean} True when a selected clip can have captions */
export const canCaptionSelection = () => selectionCaptions().ids.length > 0;

/** @returns {boolean} True when every selected clip that can have captions has them */
export const selectionIsCaptioned = () => selectionCaptions().on;

/**
 * Switch captions on or off for clips: one undo step.
 * @param {string[]} clipIds - Either clip of a linked pair stands for the pair
 * @param {boolean} on
 * @returns {boolean} False when nothing changed (locked tracks, already so)
 */
export const switchCaptions = (clipIds, on) => edit((doc) => setCaptions(doc, clipIds, on));

/**
 * Captions for the selection: on when any of it is off, off when all of it is on.
 * @returns {boolean}
 */
export function toggleSelectionCaptions() {
  const { ids, on } = selectionCaptions();
  return ids.length > 0 && switchCaptions(ids, !on);
}

/**
 * Transcribe a file and caption what plays it: captions are switched on
 * now, and the words show when the transcript is there.
 * @param {string} file
 * @param {string[]} clipIds - The voices that play it
 * @returns {Promise<boolean>} True when the file now has a transcript
 */
export function transcribeAndCaption(file, clipIds) {
  switchCaptions(clipIds, true);
  return transcribeFile(file);
}

/**
 * What "Caption all speech" did, in words.
 * @param {number} switched - Voices switched on
 * @param {import('./summary.js').CaptionSummary} after
 * @returns {{ title: string, detail: string }}
 */
export function allSpeechReport(switched, after) {
  const clips = (/** @type {number} */ n) => `${n} ${n === 1 ? 'clip' : 'clips'}`;
  const names = after.missing.filter((entry) => !entry.on).map((entry) => entry.name);
  const lacking = names.length
    ? `No transcript yet for ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} — transcribe in Inspector ▸ Captions.`
    : '';
  if (switched) return { title: `Captions on for ${clips(switched)}`, detail: lacking };
  if (after.on)
    return { title: 'Every clip with a transcript already has captions', detail: lacking };
  if (lacking) return { title: 'Nothing to caption yet', detail: lacking };
  return { title: 'No speech on the timeline to caption', detail: '' };
}

/**
 * Switch captions on for every sound clip whose file has a transcript,
 * and say what was done and what has none. One undo step.
 * @param {{ quiet?: boolean }} [opts] - `quiet`: no toast (the caller shows the result)
 * @returns {Promise<{ switched: number, title: string, detail: string }>}
 */
export async function captionAll(opts = {}) {
  const wordsOf = (/** @type {string} */ file) => wordBook.get(file);
  const files = captionSummary(getDoc(), wordsOf).voices.map((voice) => voice.file);
  // Every transcript is asked for first: only what is known to have words is switched on.
  await wordBook.ready(files);
  const before = captionSummary(getDoc(), wordsOf).on;
  edit((doc) => captionAllSpeech(doc, hasWords));
  const after = captionSummary(getDoc(), wordsOf);
  const report = { switched: after.on - before, ...allSpeechReport(after.on - before, after) };
  if (!opts.quiet) {
    showToast({
      title: report.title,
      detail: report.detail,
      kind: report.switched ? 'success' : 'info',
      actions: after.on ? [{ label: 'Style…', run: openCaptionStyle }] : [],
    });
  }
  return report;
}
