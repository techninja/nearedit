/**
 * Pointer and keyboard on the transcript text: click a word to go there,
 * Shift+click or drag to select a range, double-click to correct a word,
 * arrow keys to move, Delete to cut. These act on the `<transcript-panel>`
 * host; words are `[data-i]` elements drawn by its paragraphs.
 * @module utils/transcript/panelPointer
 */

import { panelContext } from './panelContext.js';
import { seekToUnit } from './placeActions.js';
import { revealUnit } from './panelLoad.js';

/** @typedef {import('./panelContext.js').Host} Host */

/** @type {WeakMap<HTMLElement, { from: number, moved: boolean }>} */
const drags = new WeakMap();

/**
 * @param {EventTarget|null} target
 * @returns {number} Index of the unit under an event target, -1 for none
 */
function unitIndex(target) {
  const word = target instanceof Element ? target.closest('[data-i]') : null;
  return word ? Number(/** @type {HTMLElement} */ (word).dataset.i) : -1;
}

/**
 * Go to a unit: the playhead when it is in the edit, otherwise the
 * panel's own preview player.
 * @param {Host} host
 * @param {number} index
 */
export function goToUnit(host, index) {
  const { edit, units, onTimeline } = panelContext(host);
  if (!units[index]) return;
  if (onTimeline) {
    // A word that was cut plays nowhere: the playhead stays where it is.
    if (!seekToUnit(edit, index)) host.message = 'That word is not in the edit.';
    else if (host.message) host.message = '';
    return;
  }
  const player = host.querySelector('audio');
  if (player) player.currentTime = units[index].start;
  host.current = index;
}

/**
 * Click on the text: a word (go there, or extend the selection), or a
 * paragraph's timestamp (select the paragraph).
 * @param {Host} host
 * @param {MouseEvent} event
 */
export function handleTextClick(host, event) {
  const drag = drags.get(host);
  drags.delete(host);
  if (drag?.moved) return; // the click that ends a drag-selection
  const target = /** @type {HTMLElement} */ (event.target);
  const stamp = target.closest?.('.transcript-paragraph-stamp');
  if (stamp instanceof HTMLElement) {
    Object.assign(host, { anchor: Number(stamp.dataset.from), head: Number(stamp.dataset.to) });
    return;
  }
  const index = unitIndex(target);
  if (index < 0) return;
  if ((event.shiftKey || host.extend) && host.anchor >= 0) host.head = index;
  else {
    Object.assign(host, { anchor: index, head: index });
    goToUnit(host, index);
  }
}

/** @param {Host} host @param {PointerEvent} event */
export function handleTextPointerDown(host, event) {
  const index = unitIndex(event.target);
  if (event.pointerType !== 'mouse' || event.button !== 0 || index < 0 || event.shiftKey) return;
  drags.set(host, { from: index, moved: false });
}

/** @param {Host} host @param {PointerEvent} event */
export function handleTextPointerMove(host, event) {
  const drag = drags.get(host);
  if (!drag || !(event.buttons & 1)) return;
  const index = unitIndex(document.elementFromPoint(event.clientX, event.clientY));
  if (index < 0 || (!drag.moved && index === drag.from)) return;
  drag.moved = true;
  if (host.anchor !== drag.from) host.anchor = drag.from;
  if (host.head !== index) host.head = index;
}

/** @param {Host} host @param {MouseEvent} event - Double-click: correct that word */
export function handleTextDoubleClick(host, event) {
  const index = unitIndex(event.target);
  if (index >= 0) Object.assign(host, { anchor: index, head: index, editing: index });
}

/**
 * Keyboard on the text: arrows move (Shift extends), Home/End jump, Enter
 * goes to the word, Escape clears. Returns the name of an action the
 * caller should run (`cut`, `copy`, `edit`) or ''.
 * @param {Host} host
 * @param {KeyboardEvent} event
 * @returns {string}
 */
export function textKeyAction(host, event) {
  const { units } = panelContext(host);
  const { key } = event;
  const steps = { ArrowLeft: -1, ArrowRight: 1, Home: -units.length, End: units.length };
  if (key in steps && units.length) {
    const from = host.head >= 0 ? host.head : Math.max(0, host.current);
    const next = Math.min(units.length - 1, Math.max(0, from + steps[key]));
    Object.assign(host, event.shiftKey ? { head: next } : { anchor: next, head: next });
    if (host.anchor < 0) host.anchor = next;
    revealUnit(host, next);
    return 'handled';
  }
  if (key === 'Escape') Object.assign(host, { anchor: -1, head: -1 });
  else if (key === 'Enter' && host.head >= 0) goToUnit(host, host.head);
  else if (key === 'Delete' || key === 'Backspace') return 'cut';
  else if (key === 'c' && (event.ctrlKey || event.metaKey)) return 'copy';
  else if (key === 'F2') return 'edit';
  else return '';
  return 'handled';
}
