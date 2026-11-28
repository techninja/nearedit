/**
 * Adding a brand element from the Create tab: an instance of one element
 * of the project's kit is put on the timeline where its kind belongs — an
 * overlay above the picture at the edit cursor, a segment rippled in, a
 * transition centred on the nearest cut (`insertElement` does the placing)
 * — as one undo step, selected, and the inspector comes up with its first
 * blank ready to type into.
 * @module utils/brandUi/addElement
 */

import { setAppState } from '#store/AppState.js';
import { insertElement, isElementClip } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';
import { newClipIds } from '#utils/edl/selection.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { elementItems, starterSlots } from './elementList.js';
import { currentKit } from './kitState.js';
import { requestSlotFocus } from './slotFocus.js';

/**
 * @param {string} elementId - An element of the project's kit
 * @param {{ time?: number, trackId?: string }} [at] - A drop position on the
 *   timeline; default: the edit cursor, on the track its kind belongs on
 * @returns {{ clipId: string, message: string }} `clipId` is '' when
 *   nothing was added; `message` is a sentence for a status line
 */
export function addElementItem(elementId, at = {}) {
  const kit = currentKit();
  const item = elementItems(kit).find((entry) => entry.id === elementId);
  if (!item) return { clipId: '', message: 'The brand has no such element' };
  const view = getView();
  const before = getDoc();
  const next = insertElement(before, kit, elementId, starterSlots(item.slots), {
    time: at.time ?? (view.cursorPosition || 0),
    trackId: at.trackId,
    autoCrossfade: view.autoCrossfade,
  });
  // Opening the timeline for a segment splits what was there: those pieces are new too.
  const clipId = newClipIds(before, next).find((id) => isElementClip(findClip(next, id)?.clip));
  if (!clipId) return { clipId: '', message: `${item.label} could not be added` };
  edit(() => next);
  setSelection([clipId], { expand: false });
  const { clip, track } = findClip(next, clipId);
  const where = `${track.name || 'a new track'} at ${formatTimecode(clip.timelineStart, next.fps)}`;
  if (!item.slots.length) return { clipId, message: `Added ${item.label} on ${where}` };
  // Then typing: the inspector's first field for it takes the keyboard.
  requestSlotFocus(clipId);
  setAppState({ dockTab: 'inspector', sheetOpen: true });
  return { clipId, message: `Added ${item.label} on ${where} — type its ${item.slots[0].label}` };
}
