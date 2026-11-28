/**
 * Adding a music clip from the Create tab: put a clip with that song at
 * the edit cursor on an audio track (one undo step), select it, and say
 * what happened. The clip is a placeholder for a moment; its rendering
 * arrives by itself (`rendering.js`).
 * @module utils/musicUi/addClip
 */

import { insertMusicClip } from '#utils/edl/musicClip.js';
import { findClip } from '#utils/edl/query.js';
import { newClipIds } from '#utils/edl/selection.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { openMusicEditor } from './editorState.js';

/**
 * @param {any} song - Normalised by the operation
 * @param {{ open?: boolean, label?: string }} [opts] - `open: true` opens
 *   the music editor on the new clip; `label`: what the clip is called
 *   (default: the names of its parts)
 * @returns {{ clipId: string, message: string }} `clipId` is '' when
 *   nothing was added
 */
export function addMusicClip(song, { open = false, label } = {}) {
  const view = getView();
  const before = getDoc();
  const next = insertMusicClip(before, song, {
    time: view.cursorPosition || 0,
    autoCrossfade: view.autoCrossfade,
    label,
  });
  const [clipId] = newClipIds(before, next);
  if (!clipId) return { clipId: '', message: 'The music could not be added' };
  edit(() => next);
  setSelection([clipId], { expand: false });
  if (open) openMusicEditor(clipId);
  const { clip, track } = findClip(next, clipId);
  const at = formatTimecode(clip.timelineStart, next.fps);
  return { clipId, message: `Added ${clip.label} on ${track.name || 'a new track'} at ${at}` };
}
