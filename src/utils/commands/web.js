/**
 * Commands for web clips: open the selected web clip in the web editor,
 * record it, and record every web clip that is not recorded or out of date.
 * @module utils/commands/web
 */

import { isWebClip } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { webClipsToRecord } from '#utils/webUi/clipStatus.js';
import { openWebEditor } from '#utils/webUi/editorState.js';
import { recordAllStale, recordClip } from '#utils/webUi/recording.js';

/**
 * @returns {string[]} The selected clips that are web clips on unlocked tracks
 */
export function selectedWebClips() {
  const doc = getDoc();
  return getSelection().filter((clipId) => {
    const found = findClip(doc, clipId);
    return found && !found.track.locked && isWebClip(found.clip);
  });
}

/** @returns {boolean} True when a web clip is selected */
export const hasWebClip = () => selectedWebClips().length > 0;

/** Open the (first) selected web clip in the web editor. @returns {boolean} */
export function editWebSteps() {
  const [clipId] = selectedWebClips();
  return clipId ? openWebEditor(clipId) : false;
}

/** Record the selected web clips. */
export function recordSelectedWeb() {
  for (const clipId of selectedWebClips()) recordClip(clipId);
}

/** @returns {boolean} True when a web clip was never recorded or is out of date */
export const hasStaleWeb = () => webClipsToRecord(getDoc()).total > 0;

/** Record every web clip that needs it. */
export function recordStaleWeb() {
  recordAllStale();
}
