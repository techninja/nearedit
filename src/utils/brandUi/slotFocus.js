/**
 * "Add a lower third, then type": after an element clip was added, the
 * inspector's field for its first blank takes the keyboard, with what it
 * starts with selected so that typing replaces it. The request is kept
 * here until the inspector's Brand element group has rendered that clip
 * (its tab may only just have been opened) and is dropped when it no
 * longer applies.
 * @module utils/brandUi/slotFocus
 */

/** How long a request waits for the inspector, ms. */
const PATIENCE = 4000;

/** @type {{ clipId: string, at: number }|null} */
let wanted = null;

/**
 * Ask for the first blank of a clip to be focused.
 * @param {string} clipId
 * @param {number} [now] - Milliseconds, for tests
 */
export function requestSlotFocus(clipId, now = Date.now()) {
  wanted = clipId ? { clipId, at: now } : null;
}

/**
 * The inspector shows a clip: is its first blank to take the keyboard?
 * Asking uses the request up.
 * @param {string} clipId - The one element clip the group shows
 * @param {number} [now]
 * @returns {boolean}
 */
export function takeSlotFocus(clipId, now = Date.now()) {
  if (!wanted) return false;
  const due = wanted.clipId === clipId && now - wanted.at <= PATIENCE;
  // Another clip is showing, or it took too long: the moment has passed.
  if (due || now - wanted.at > PATIENCE) wanted = null;
  return due;
}
