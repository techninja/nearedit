/**
 * Cut, copy, paste and duplicate. The clipboard is a plain JSON payload
 * (`copyClips`) kept in memory and mirrored to `localStorage`, so it
 * survives a reload and can be pasted into another adaptation or tab.
 * @module utils/commands/clipboard
 */

import { copyClips, duplicateClips, pasteClips } from '#utils/edl/index.js';
import { getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { editAndSelectNew, editModes, editTime, targetTrack } from './context.js';
import { deleteSelection } from './edit.js';

/** @returns {{ ripple: false, autoCrossfade: boolean }} Options of an edit that `editAndSelectNew` ripples itself */
const plainEdit = () => ({ ripple: false, autoCrossfade: editModes().autoCrossfade });

export const CLIPBOARD_KEY = 'nearedit_clipboard';

/** @typedef {import('#utils/edl/clipboard.js').Clipboard} Clipboard */

/** @type {Clipboard|null|undefined} undefined = the mirror has not been read yet */
let memory;
/** @type {Set<() => void>} */
const listeners = new Set();

/** @returns {Storage|null} localStorage, or null where there is none (Node, blocked storage) */
function storage() {
  try {
    return globalThis.localStorage || null;
  } catch (err) {
    console.warn('[clipboard] localStorage is not available:', err.message);
    return null;
  }
}

/**
 * @param {string|null|undefined} raw - Stored JSON
 * @returns {Clipboard|null}
 */
function parse(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.kind === 'nearedit/clips' && Array.isArray(parsed.items) ? parsed : null;
  } catch (err) {
    console.warn('[clipboard] ignoring an unreadable stored clipboard:', err.message);
    return null;
  }
}

// Another tab copied: forget our copy so the next read takes theirs.
globalThis.addEventListener?.('storage', (/** @type {any} */ event) => {
  if (event.key !== CLIPBOARD_KEY) return;
  memory = undefined;
  for (const listener of listeners) listener();
});

/** @returns {Clipboard|null} The current clipboard payload */
export function getClipboard() {
  if (memory === undefined) memory = parse(storage()?.getItem(CLIPBOARD_KEY));
  return memory;
}

/** @returns {boolean} True when there is something to paste */
export const hasClipboard = () => !!getClipboard();

/**
 * Be told when the clipboard gains or changes content (to enable Paste).
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onClipboardChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Copy the selected clips (with their linked partners).
 * @returns {boolean} false when nothing is selected
 */
export function copySelection() {
  const payload = copyClips(getDoc(), getSelection());
  if (!payload) return false;
  memory = payload;
  try {
    storage()?.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[clipboard] could not mirror the clipboard to localStorage:', err.message);
  }
  for (const listener of listeners) listener();
  return true;
}

/**
 * Copy the selection, then delete it (closing the gap in ripple mode).
 * @returns {boolean}
 */
export function cutSelection() {
  return copySelection() && deleteSelection();
}

/**
 * Paste at the cursor. The top-most copied track lands on the active track
 * when one of the same type is active; other clips keep their rows. The
 * pasted clips become the selection; with auto ripple on, what follows on
 * their tracks makes room.
 * @returns {boolean} false when the clipboard is empty
 */
export function paste() {
  const payload = getClipboard();
  if (!payload) return false;
  const opts = { time: editTime(), trackId: targetTrack(), ...plainEdit() };
  return editAndSelectNew((doc) => pasteClips(doc, payload, opts));
}

/**
 * Duplicate the selection right after itself and select the copies.
 * @returns {boolean}
 */
export function duplicateSelection() {
  const ids = getSelection();
  if (!ids.length) return false;
  return editAndSelectNew((doc) => duplicateClips(doc, ids, plainEdit()));
}
