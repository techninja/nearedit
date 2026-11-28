/**
 * Changing what is filled into element clips, through the edit session
 * (`updateElementSlots`), so undo works and autosave keeps it. Typing
 * changes the text many times; a visit to one field is one interaction and
 * so one undo step (the gesture the rest of the inspector uses). Detaching
 * is here too: it ends a clip's tie to the brand.
 * @module utils/brandUi/slotEdits
 */

import { elementNeeds, formatOf } from '#utils/brand/index.js';
import { setFont } from '#utils/compose/text/draw.js';
import { parseResolution } from '#utils/edl/factory.js';
import { detachElement, updateElementSlots } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';
import { newClipIds } from '#utils/edl/selection.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { setSelection } from '#utils/editor/view.js';
import { cancelEdit, commitEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';

/** @typedef {'live'|'commit'|'cancel'} Phase */

/**
 * Fill a blank of element clips.
 * @param {string[]} clipIds
 * @param {string} slot - Slot name
 * @param {string} text
 * @param {Phase} [phase='commit']
 * @param {Element|null} [element] - The field, so presses inside it keep the step open
 * @returns {boolean} true when the document changed (always false while live)
 */
export function changeSlot(clipIds, slot, text, phase = 'commit', element = null) {
  if (phase === 'cancel') {
    cancelEdit();
    return false;
  }
  /** @type {(doc: any) => any} */
  const operation = (doc) =>
    clipIds.reduce((next, clipId) => updateElementSlots(next, clipId, { [slot]: text }), doc);
  const key = `element.slot:${slot}`;
  if (phase === 'live') {
    liveEdit(key, operation, element);
    return false;
  }
  return commitEdit(key, operation);
}

/**
 * The size of a picture once the browser has it.
 * @param {string} path - Media path
 * @returns {Promise<[string, { width: number, height: number }|null]>}
 */
function sizeOfPicture(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve([path, { width: image.naturalWidth, height: image.naturalHeight }]);
    image.onerror = () => resolve([path, null]);
    image.src = pictureUrl(path);
  });
}

/**
 * Turn element clips into the ordinary clips that draw them — one undo
 * step — and select those. Text is laid out with this browser's own
 * measure and pictures at their real size, so nothing moves on screen.
 * @param {string[]} clipIds
 * @returns {Promise<number>} How many were detached
 */
export async function detachElements(clipIds) {
  finishEdit();
  const before = getDoc();
  const blocks = clipIds.map((clipId) => findClip(before, clipId)?.clip.element).filter(Boolean);
  const format = formatOf(parseResolution(before.resolution));
  const paths = new Set(blocks.flatMap((block) => elementNeeds(block, format).images));
  const sizes = new Map(await Promise.all([...paths].map(sizeOfPicture)));
  const ruler = document.createElement('canvas').getContext('2d');
  const host = {
    measure(/** @type {string} */ run, /** @type {any} */ style) {
      setFont(ruler, { ...style, fonts: getDoc().fonts });
      return ruler.measureText(run).width;
    },
    sizeOf: (/** @type {string} */ path) => sizes.get(path) || null,
  };
  let detached = 0;
  const start = getDoc();
  const next = clipIds.reduce((doc, clipId) => {
    const out = detachElement(doc, clipId, host);
    if (out !== doc) detached += 1;
    return out;
  }, start);
  if (!edit(() => next)) return 0;
  setSelection(newClipIds(start, next), { expand: false });
  return detached;
}
