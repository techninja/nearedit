/**
 * How the music editor (`<music-editor>`) shows things and what its keys
 * do: which tab is up on a narrow screen; Space plays and stops; Ctrl/Cmd+Z
 * undoes inside the dialog — and, after every render, keeping the audition
 * in step with the song as it now is.
 * @module utils/musicUi/editorView
 */

import { redo, undo } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { stopAudition, updateAudition } from './audition.js';
import { handleTransport, shown } from './editorEvents.js';
import { closeMusicEditor, musicEditorState } from './editorState.js';
import { heardSong } from './heardSong.js';

/**
 * @typedef {Object} MusicEditorHost
 * @property {import('./editorState.js').MusicEditorState} state
 * @property {any} doc - The open document
 * @property {import('./audition.js').AuditionState} audition
 * @property {{ byClip: Record<string, import('./renderState.js').RenderStatus> }} renders
 * @property {boolean} services - Internal: keeps music clips rendered while connected
 */

/** @typedef {MusicEditorHost & HTMLElement} Host */

/** The three parts a narrow screen shows one at a time. */
export const TABS = [
  { id: 'parts', label: 'Parts', icon: 'list' },
  { id: 'grid', label: 'Grid', icon: 'grid' },
  { id: 'sound', label: 'Sound', icon: 'sliders' },
];

/** @param {Host} _host @param {CustomEvent} event */
export function handleTab(_host, event) {
  musicEditorState.set({ tab: event.detail.id });
}

/**
 * Keys anywhere in the dialog: Space plays and stops (except where a
 * space is typed or a box is ticked); Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z
 * (or Ctrl+Y) redoes — the editor's own shortcuts are behind the dialog —
 * except in a text box, which has its own undo.
 * @param {Host} _host
 * @param {KeyboardEvent} event
 */
export function handleKeys(_host, event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === ' ' && !mod && !event.altKey) {
    if (target.matches?.('input, select, textarea')) return;
    event.preventDefault();
    return void handleTransport();
  }
  const key = event.key.toLowerCase();
  if (!mod || event.altKey || (key !== 'z' && key !== 'y')) return;
  if (target.matches?.('input[type="text"], textarea')) return;
  event.preventDefault();
  finishEdit();
  if (key === 'y' || event.shiftKey) redo();
  else undo();
}

/**
 * After every render: close when the clip is gone (deleted, undone), and
 * let the audition follow the song, the solo and the looped bars.
 * @param {Host} host
 */
export function sync(host) {
  if (!host.state.clipId) return;
  const now = shown();
  if (!now) {
    stopAudition('editor');
    return void closeMusicEditor();
  }
  updateAudition('editor', heardSong(now.song, now.view.solo), now.loop);
}
