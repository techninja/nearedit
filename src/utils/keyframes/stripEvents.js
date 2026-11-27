/**
 * Behaviour of the keyframe strip (`<keyframe-strip>`): pressing a key
 * selects it (Shift / Ctrl adds or removes), a click jumps the playhead to
 * it, dragging retimes the selected keys as one undo step, and dragging on
 * the empty track scrubs the playhead. Handlers sit on the rows container,
 * which also keeps the pointer during a drag.
 * @module utils/keyframes/stripEvents
 */

import { getDoc } from '#utils/editor/session.js';
import { cancelEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { seek } from '#utils/playback/transport.js';
import { pathLabel } from './labels.js';
import { dragDelta, stripRange, stripRows, timeAt } from './strip.js';
import { moveKeys, movedIds } from './stripEdit.js';
import { pressSelection, selectedKeys } from './stripSelection.js';

/**
 * @typedef {Object} KeyframeStripHost
 * @property {any} clip - The clip whose keys are shown, as stored
 * @property {number} time - The playhead, timeline seconds
 * @property {number} fps
 * @property {boolean} locked - The clip's track is locked
 * @property {string[]} selected - Ids of the selected keys
 * @property {'clip'|'keys'} fit - Show the whole clip, or zoom to its keys
 * @property {boolean} collapsed
 */

/** @typedef {KeyframeStripHost & HTMLElement} Host */

/** Pixels the pointer must travel before a press on a key is a drag. */
const DRAG_START = 3;

/**
 * @typedef {Object} StripDrag
 * @property {'keys'|'scrub'} kind
 * @property {number} x - Where the pointer went down
 * @property {DOMRect} rect - The track on screen
 * @property {import('./strip.js').StripRange} range
 * @property {import('./strip.js').StripKey[]} keys - What is dragged
 * @property {number} at - Time of the key that was pressed
 * @property {boolean} toggled - The press changed the selection with a modifier
 * @property {boolean} moved
 */

/** @type {WeakMap<HTMLElement, StripDrag>} */
const drags = new WeakMap();

/** @param {Host} host @returns {import('./strip.js').StripRow[]} */
export const rowsOf = (host) =>
  host.clip?.clipId ? stripRows(host.clip, stripRange(host.clip, host.fit), pathLabel) : [];

/** @param {DOMRect} rect @param {number} x @returns {number} 0..1 along the track */
const along = (rect, x) => (x - rect.left) / (rect.width || 1);

/** @param {Host} host @param {PointerEvent} event */
export function handleDown(host, event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const track = target.closest?.('.keyframe-strip-track');
  if (!track || event.button !== 0) return;
  const rect = track.getBoundingClientRect();
  const range = stripRange(host.clip, host.fit);
  const id = /** @type {HTMLElement|null} */ (target.closest('.keyframe-strip-key'))?.dataset.id;
  const toggled = event.shiftKey || event.ctrlKey || event.metaKey;
  /** @type {StripDrag} */
  const drag = {
    kind: 'scrub',
    x: event.clientX,
    rect,
    range,
    keys: [],
    at: 0,
    toggled,
    moved: false,
  };
  if (id) {
    host.selected = pressSelection(host.selected, id, toggled);
    const rows = rowsOf(host);
    drag.kind = 'keys';
    drag.keys = host.selected.includes(id) ? selectedKeys(rows, host.selected) : [];
    drag.at = selectedKeys(rows, [id])[0]?.time ?? 0;
  } else {
    if (!toggled) host.selected = [];
    seek(timeAt(range, along(rect, event.clientX)));
  }
  drags.set(host, drag);
  /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
}

/** @param {Host} host @param {PointerEvent} event */
export function handleMove(host, event) {
  const drag = drags.get(host);
  if (!drag) return;
  if (drag.kind === 'scrub') return seek(timeAt(drag.range, along(drag.rect, event.clientX)));
  const dx = event.clientX - drag.x;
  if ((!drag.moved && Math.abs(dx) < DRAG_START) || host.locked || !drag.keys.length) return;
  drag.moved = true;
  const times = drag.keys.map((key) => key.time);
  const move = { fps: host.fps, times, clip: host.clip };
  const delta = dragDelta(drag.range, dx, drag.rect.width, move);
  const { clipId } = host.clip;
  liveEdit('keyframes:move', (doc) => moveKeys(doc, clipId, drag.keys, delta), host);
  host.selected = movedIds(getDoc(), drag.keys, delta);
}

/** @param {Host} host @param {PointerEvent} event */
export function handleUp(host, event) {
  const drag = drags.get(host);
  drags.delete(host);
  if (!drag || drag.kind !== 'keys') return;
  if (drag.moved) return event.type === 'pointercancel' ? cancelEdit() : void finishEdit();
  // A plain click on a key: go there.
  if (!drag.toggled && event.type === 'pointerup') seek(drag.at);
}

/**
 * A key activated from the keyboard (Enter or Space): select it and go there.
 * @param {Host} host
 * @param {MouseEvent} event
 */
export function handleKeyClick(host, event) {
  if (event.detail > 0) return; // pointer clicks are handled on pointer-up
  const { id } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const [key] = selectedKeys(rowsOf(host), [id]);
  if (!key) return;
  host.selected = [id];
  seek(key.time);
}
