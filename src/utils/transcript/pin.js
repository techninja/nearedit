/**
 * The file pinned in the transcript panel. Normally the panel follows the
 * selection; pinning a file (from the media bin, or the panel's own file
 * menu) keeps its transcript on screen whatever is selected.
 * @module utils/transcript/pin
 */

let pinned = '';
/** @type {Set<(path: string) => void>} */
const listeners = new Set();

/** @returns {string} Absolute path of the pinned file, '' when following the selection */
export const pinnedTranscript = () => pinned;

/**
 * Pin a file's transcript, or with '' go back to following the selection.
 * @param {string} path
 */
export function pinTranscript(path) {
  const next = path || '';
  if (next === pinned) return;
  pinned = next;
  for (const listener of listeners) listener(pinned);
}

/**
 * @param {(path: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onPinChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
