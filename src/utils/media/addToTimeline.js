/**
 * Adding media to the timeline from the panels: at the edit cursor, as one
 * undo step, honouring the editor's ripple and auto-crossfade modes, with
 * the new clips selected and the cursor moved to their end (as in Vegas, so
 * adding again continues the sequence).
 * @module utils/media/addToTimeline
 */

import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { insertSequence } from '#utils/media/insertSequence.js';
import { isPlaying, seek } from '#utils/playback/transport.js';

/**
 * @param {import('#utils/media/insertSequence.js').SequenceEntry[]} entries -
 *   Media items (with optional source ranges) in playing order
 * @returns {{ clipIds: string[], placed: number }} What was created; nothing
 *   when no entry could be placed (text files, locked tracks)
 */
export function addToTimeline(entries) {
  const view = getView();
  const opts = {
    time: view.cursorPosition || 0,
    trackId: view.activeTrackId || undefined,
    ripple: view.ripple,
    autoCrossfade: view.autoCrossfade,
  };
  const result = insertSequence(getDoc(), entries, opts);
  if (!result.placed) return { clipIds: [], placed: 0 };
  edit(() => result.edl);
  setSelection(result.clipIds, { expand: false });
  if (!isPlaying()) seek(result.end); // never yank the playhead out of playback
  return { clipIds: result.clipIds, placed: result.placed };
}
