/**
 * The music clip part of a clip's context menu: right-click a music clip
 * to open it in the music editor, to try its rendering again when that
 * failed, or to save its song as a MIDI file.
 * @module utils/timeline/menuMusic
 */

import { findClip } from '#utils/edl/query.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import { isMusicClip } from '#utils/music/clip.js';
import { openMusicEditor } from '#utils/musicUi/editorState.js';
import { exportMidi } from '#utils/musicUi/midiFiles.js';
import { retryRendering } from '#utils/musicUi/rendering.js';
import { renderStatusOf } from '#utils/musicUi/renderState.js';

/**
 * Menu items for a music clip under a point.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {{ clipId?: string }} hit
 * @returns {import('./menuModel.js').MenuItem[]} Empty when the clip is not a music clip
 */
export function musicMenu(doc, { clipId }) {
  const clip = findClip(doc, clipId)?.clip;
  if (!isMusicClip(clip)) return [];
  const edit = {
    label: 'Edit music…',
    shortcut: shortcutLabel('music.edit'),
    run: () => void openMusicEditor(clipId),
  };
  const midi = { label: 'Export MIDI', run: () => void exportMidi(clip) };
  const failed = renderStatusOf(clipId)?.status === 'failed';
  const retry = { label: 'Render again', run: () => retryRendering(clipId) };
  return [edit, ...(failed ? [retry] : []), midi, { separator: true }];
}
