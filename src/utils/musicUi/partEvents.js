/**
 * What the music editor does when the parts list asks for something:
 * open a part, solo it, add one, copy, remove or move it. Adding and
 * copying open the new part; removing opens the one that takes its place.
 * @module utils/musicUi/partEvents
 */

import { finishEdit } from '#utils/inspector/gesture.js';
import { musicClipOf, musicEditorState, selectPart, toggleSolo } from './editorState.js';
import { changeSong } from './edits.js';
import { addPart, duplicatePart, movePart, removePart } from './partEdit.js';

/**
 * @param {any} _host
 * @param {CustomEvent} event - `music-part`: `{ action, partId, kind, by }`
 */
export function handlePart(_host, event) {
  const { action, partId, kind, by } = event.detail;
  const { clipId } = musicEditorState.get();
  const song = musicClipOf(clipId)?.clip.music.song;
  if (!song) return;
  if (action === 'select') return void selectPart(partId);
  if (action === 'solo') return void toggleSolo(partId);
  finishEdit();
  if (action === 'add' || action === 'duplicate') {
    /** @type {(from: any) => { song: any, partId: string }} */
    const make = (from) => (action === 'add' ? addPart(from, kind) : duplicatePart(from, partId));
    const made = make(song).partId;
    if (made && changeSong(clipId, 'parts', (from) => make(from).song)) selectPart(made);
  } else if (action === 'move') changeSong(clipId, 'parts', (from) => movePart(from, partId, by));
  else if (action === 'remove') {
    const at = song.parts.findIndex((part) => part.id === partId);
    const next = song.parts[at + 1] || song.parts[at - 1];
    if (changeSong(clipId, 'parts', (from) => removePart(from, partId))) selectPart(next?.id || '');
  }
}
