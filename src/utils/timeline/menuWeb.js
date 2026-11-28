/**
 * The web clip part of a clip's context menu: right-click a web clip to
 * edit its steps or to record it.
 * @module utils/timeline/menuWeb
 */

import { isWebClip } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';
import { fpsOf } from '#utils/edl/time.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import { isRecording, webClipStatus } from '#utils/webUi/clipStatus.js';
import { openWebEditor } from '#utils/webUi/editorState.js';
import { cancelRecording, recordClip, recordingOf } from '#utils/webUi/recording.js';

/**
 * Menu items for a web clip under a point.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {{ clipId?: string }} hit
 * @returns {import('./menuModel.js').MenuItem[]} Empty when the clip is not a web clip
 */
export function webMenu(doc, { clipId }) {
  const clip = findClip(doc, clipId)?.clip;
  if (!isWebClip(clip)) return [];
  const recording = recordingOf(clipId);
  const { action } = webClipStatus(clip, fpsOf(doc), recording);
  const record = isRecording(recording)
    ? { label: 'Cancel recording', run: () => cancelRecording(clipId) }
    : { label: action, shortcut: shortcutLabel('web.record'), run: () => void recordClip(clipId) };
  const edit = {
    label: 'Edit steps…',
    shortcut: shortcutLabel('web.editSteps'),
    run: () => void openWebEditor(clipId),
  };
  return [edit, record, { separator: true }];
}
