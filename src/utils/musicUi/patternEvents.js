/**
 * What the music editor does when the open part's pattern changes: steps
 * of the drum grid, its lane tools, a named beat and its fill; the notes
 * of the piano roll and their selection; and "Write". Each is an edit of
 * the clip's song — one undo step per press, drag or held key.
 * @module utils/musicUi/patternEvents
 */

import { finishEdit } from '#utils/inspector/gesture.js';
import { addFill, applyBeat } from './drumBeats.js';
import { clearLane, fillLane, paintSteps, shiftLane } from './drumEdit.js';
import { shown } from './editorEvents.js';
import { musicEditorState } from './editorState.js';
import { changeSongPart } from './edits.js';
import { writePart } from './writeNotes.js';

/** @typedef {import('./editorView.js').MusicEditorHost & HTMLElement} Host */

/**
 * Change the open part.
 * @param {CustomEvent} event
 * @param {string} key
 * @param {(part: any, song: any) => any} to
 * @param {'live'|'commit'|'cancel'} [phase]
 */
function changeShown(event, key, to, phase) {
  const now = shown();
  if (now?.part) {
    changeSongPart(now.clipId, now.part.id, key, to, phase, /** @type {Element} */ (event.target));
  }
}

/** Steps of a drum lane were set. @param {Host} _host @param {CustomEvent} event */
export function handleSteps(_host, event) {
  const { drum, steps, char, phase } = event.detail;
  changeShown(event, 'steps', (part) => paintSteps(part, drum, steps, char), phase);
}

/** A lane tool: clear, shift, fill. @param {Host} _host @param {CustomEvent} event */
export function handleLane(_host, event) {
  const { action, drum, by } = event.detail;
  const tools = { clear: clearLane, shift: shiftLane, fill: fillLane };
  changeShown(event, 'lane', (part) => tools[action](part, drum, by));
}

/** "Beat…" and "Fill". @param {Host} _host @param {CustomEvent} event */
export function handleBeat(_host, event) {
  const { action, name } = event.detail;
  if (action === 'beat') changeShown(event, 'beat', (part) => applyBeat(part, name));
  else changeShown(event, 'fill', (part, song) => addFill(song, part));
}

/** The piano roll changed its notes. @param {Host} _host @param {CustomEvent} event */
export function handleNotes(_host, event) {
  const { notes, keys, phase } = event.detail;
  changeShown(event, 'notes', (part) => ({ ...part, notes }), phase);
  if (phase !== 'cancel') musicEditorState.set({ notes: keys });
}

/** The selection of the piano roll. @param {Host} _host @param {CustomEvent} event */
export const handleSelect = (_host, event) => musicEditorState.set({ notes: event.detail.keys });

/** "Write": the helpers write the open part's notes, one undo step. @param {Host} _host @param {CustomEvent} event */
export function handleWrite(_host, event) {
  const now = shown();
  const { form } = event.detail;
  if (!now?.part) return;
  const { problem } = writePart(now.song, now.part, form);
  // The form says why nothing was written.
  /** @type {any} */ (event.target).problem = problem;
  if (problem) return;
  finishEdit();
  changeShown(event, 'write', (part, song) => writePart(song, part, form).part);
  musicEditorState.set({ notes: [] });
}
