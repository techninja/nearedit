/**
 * What the music editor (`<music-editor>`) does with the events its parts
 * send up. Fields, steps, notes and parts become edits of the clip's song
 * through the edit session (`edits.js`), one undo step per interaction;
 * what is only a way of looking or listening — the open part, solo, the
 * looped bars, the selection — goes to the editor's own state.
 * What happens to the open part's steps and notes is in `patternEvents.js`.
 * @module utils/musicUi/editorEvents
 */

import { redo, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { auditionState, playSong, stopAudition } from './audition.js';
import { drumHit, noteHit, playHit } from './auditionHits.js';
import * as state from './editorState.js';
import { changeSong } from './edits.js';
import { setField } from './fieldRoutes.js';
import { heardSong } from './heardSong.js';
import { paintPlay } from './playStrip.js';

/** @typedef {import('./editorView.js').MusicEditorHost & HTMLElement} Host */

/** What the dialog is about, as it is in the session right now. */
export function shown() {
  const view = state.musicEditorState.get();
  const found = state.musicClipOf(view.clipId);
  if (!found) return null;
  const { song } = found.clip.music;
  const part = state.shownPart(view, song);
  return { view, clipId: view.clipId, song, part, loop: state.shownLoop(view, song) };
}

/** Close the dialog, ending any edit under way and the audition. */
export function handleClose() {
  finishEdit();
  stopAudition('editor');
  state.closeMusicEditor();
}

/** A field changed: of the editor's own state, of the song, or of a part. @param {Host} _host @param {CustomEvent} event */
export function handleField(_host, event) {
  const { name, value, phase } = event.detail;
  const now = shown();
  event.stopPropagation();
  if (!now) return;
  if (name === 'loop') return void state.musicEditorState.set({ loop: value });
  if (name === 'grid') return void state.musicEditorState.set({ grid: Number(value) || 0 });
  if (name === 'snapScale') return void state.musicEditorState.set({ snapScale: value === true });
  const shownId = now.part?.id || '';
  /** @type {(song: any) => any} */
  const change = (song) => setField(song, name, value, shownId);
  changeSong(now.clipId, name, change, phase, /** @type {Element} */ (event.target));
}

/** Play or stop. Called from a press or a key: sound may start. */
export function handleTransport() {
  const now = shown();
  const playing = auditionState.get().owner === 'editor' && auditionState.get().playing;
  if (playing || !now) return void stopAudition('editor');
  playSong('editor', heardSong(now.song, now.view.solo), now.loop);
}

/** A bar of a part's strip was painted. @param {Host} _host @param {CustomEvent} event */
export function handlePlayStrip(_host, event) {
  const { partId, bars, on, phase } = event.detail;
  /** @type {(song: any) => any} */
  const change = (song) => paintPlay(song, partId, bars, on);
  changeSong(
    shown()?.clipId,
    `play.${partId}`,
    change,
    phase,
    /** @type {Element} */ (event.target),
  );
}

/** One drum or one note is to be heard. @param {Host} _host @param {CustomEvent} event */
export function handleHear(_host, event) {
  const now = shown();
  const { drum, char, pitch, velocity, length } = event.detail;
  if (!now?.part) return;
  if (drum) playHit(drumHit(now.song, now.part, drum, char));
  else playHit(noteHit(now.song, now.part, pitch, velocity, length));
}

/** A way of looking: every drum, the "Write…" form. @param {Host} _host @param {CustomEvent} event */
export const handleView = (_host, event) => state.musicEditorState.set(event.detail);

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
