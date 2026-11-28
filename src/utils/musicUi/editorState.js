/**
 * State of the music editor dialog: which clip it shows, which part is
 * open, the bars the audition loops, which parts are soloed (while
 * editing only — the song has no solo), the notes selected in the piano
 * roll and its grid, and — on a narrow screen — which of its three tabs is
 * up. The song itself is never kept here: it lives in the clip, in the
 * edit session.
 * @module utils/musicUi/editorState
 */

import { setAppState } from '#store/AppState.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { isMusicClip } from '#utils/music/clip.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} MusicEditorState
 * @property {string} clipId - '' while the dialog is closed
 * @property {string} partId - The part whose grid and sound show; '' = the first
 * @property {'parts'|'grid'|'sound'} tab - Narrow layout: the part that shows
 * @property {number[]} loop - `[from, to)` in bars the audition repeats;
 *   `[0, 0]` = the whole song
 * @property {string[]} solo - Ids of the parts heard alone while editing
 * @property {string[]} notes - Keys of the notes selected in the piano roll
 * @property {number} grid - Beats between the lines of the piano roll's grid
 * @property {boolean} snapScale - New and moved notes go to the song's scale
 * @property {boolean} writing - The "Write…" form is open
 * @property {boolean} allLanes - The drum grid shows every drum of the kit
 */

/** @type {MusicEditorState} */
const CLOSED = {
  clipId: '',
  partId: '',
  tab: 'grid',
  loop: [0, 0],
  solo: [],
  notes: [],
  grid: 0.25,
  snapScale: false,
  writing: false,
  allLanes: false,
};

/** @type {import('#utils/ui/observable.js').Observable<MusicEditorState>} */
export const musicEditorState = createObservable({ ...CLOSED });

/**
 * @param {string} clipId
 * @returns {{ clip: any, track: any }|null} The clip when it is a music clip
 */
export function musicClipOf(clipId) {
  const found = findClip(getDoc(), clipId);
  return found && isMusicClip(found.clip) ? found : null;
}

/**
 * Open the music editor for a clip, on its first part.
 * @param {string} clipId
 * @returns {boolean} false when the clip is not a music clip
 */
export function openMusicEditor(clipId) {
  const found = musicClipOf(clipId);
  if (!found) return false;
  // The dialog is mounted in the dock, which a narrow screen hides while its sheet is closed.
  setAppState({ sheetOpen: true });
  const [first] = found.clip.music.song.parts;
  musicEditorState.set({ ...CLOSED, clipId, partId: first?.id || '' });
  return true;
}

/** Close the dialog. */
export function closeMusicEditor() {
  if (musicEditorState.get().clipId) musicEditorState.set({ ...CLOSED });
}

/**
 * The part the dialog shows: the chosen one while the song still has it
 * (an undo may have taken it away), else the first.
 * @param {MusicEditorState} state
 * @param {{ parts: any[] }} song
 * @returns {any|null} null for a song without parts
 */
export function shownPart(state, song) {
  return song.parts.find((part) => part.id === state.partId) || song.parts[0] || null;
}

/**
 * The bars the audition repeats, inside the song as it is now.
 * @param {MusicEditorState} state
 * @param {{ bars: number }} song
 * @returns {number[]} `[from, to)`, at least one bar
 */
export function shownLoop(state, song) {
  const [from, to] = state.loop;
  if (!(to > from) || from >= song.bars) return [0, song.bars];
  return [Math.max(0, from), Math.min(song.bars, to)];
}

/**
 * Show a part: its grid and its sound.
 * @param {string} partId
 */
export function selectPart(partId) {
  if (musicEditorState.get().partId === partId) return;
  musicEditorState.set({ partId, notes: [], writing: false, allLanes: false });
}

/**
 * Hear a part alone, or stop doing so.
 * @param {string} partId
 */
export function toggleSolo(partId) {
  const { solo } = musicEditorState.get();
  const next = solo.includes(partId) ? solo.filter((id) => id !== partId) : [...solo, partId];
  musicEditorState.set({ solo: next });
}
