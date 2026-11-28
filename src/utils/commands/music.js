/**
 * Commands for music clips: open the selected music clip in the music
 * editor, and save its song as a MIDI file.
 * @module utils/commands/music
 */

import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { isMusicClip } from '#utils/music/clip.js';
import { openMusicEditor } from '#utils/musicUi/editorState.js';
import { exportMidi } from '#utils/musicUi/midiFiles.js';

/**
 * @returns {string[]} The selected clips that are music clips
 */
export function selectedMusicClips() {
  const doc = getDoc();
  return getSelection().filter((clipId) => isMusicClip(findClip(doc, clipId)?.clip));
}

/** @returns {boolean} True when a music clip is selected */
export const hasMusicClip = () => selectedMusicClips().length > 0;

/** Open the (first) selected music clip in the music editor. @returns {boolean} */
export function editMusic() {
  const [clipId] = selectedMusicClips();
  return clipId ? openMusicEditor(clipId) : false;
}

/** Save the song of the (first) selected music clip as a MIDI file. @returns {boolean} */
export function exportSelectedMidi() {
  const [clipId] = selectedMusicClips();
  if (!clipId) return false;
  exportMidi(findClip(getDoc(), clipId).clip);
  return true;
}
