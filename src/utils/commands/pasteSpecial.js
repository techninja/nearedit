/**
 * The two special pastes of Vegas: paste insert (everything after the
 * cursor moves along to make room) and paste repeat (several copies, end
 * to end or at a fixed spacing).
 * @module utils/commands/pasteSpecial
 */

import { EPS, findClip, newClipIds, snapToFrame } from '#utils/edl/index.js';
import { pasteInsert, pasteRepeat } from '#utils/edl/selectionEdits.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { setSelection } from '#utils/editor/view.js';
import { getClipboard } from './clipboard.js';
import { editAndSelectNew, editModes, editTime, targetTrack } from './context.js';
import { forgetLastEdit } from './postRipple.js';

/**
 * Ctrl+Shift+V: open a gap on every track at the cursor and paste into it.
 * The pasted clips become the selection.
 * @returns {boolean} false when the clipboard is empty
 */
export function pasteInsertAtCursor() {
  const payload = getClipboard();
  if (!payload) return false;
  const before = getDoc();
  const time = editTime();
  const opts = { time, trackId: targetTrack(), autoCrossfade: editModes().autoCrossfade };
  if (!edit((doc) => pasteInsert(doc, payload, opts))) return false;
  // The gap was this edit's own ripple: nothing is left for F to follow.
  forgetLastEdit();
  // Clips the gap cut in two also got new ids; the pasted ones start inside the gap.
  const end = snapToFrame(time, before.fps || 30) + payload.duration - EPS;
  const starts = (id) => findClip(getDoc(), id).clip.timelineStart;
  setSelection(
    newClipIds(before, getDoc()).filter((id) => starts(id) < end),
    { expand: false },
  );
  return true;
}

/**
 * Ctrl+B: paste the clipboard several times from the cursor on.
 * @param {{ count?: number, every?: number }} [how] - `count` copies (default
 *   2); `every`: seconds from one copy's start to the next, 0 = end to end
 * @returns {boolean} false when the clipboard is empty
 */
export function pasteRepeatAtCursor(how = {}) {
  const payload = getClipboard();
  if (!payload) return false;
  const { count = 2, every = 0 } = how;
  const { autoCrossfade } = editModes();
  const opts = { time: editTime(), trackId: targetTrack(), count, every, autoCrossfade };
  return editAndSelectNew((doc) => pasteRepeat(doc, payload, opts));
}
