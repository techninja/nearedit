/**
 * One field interaction = one undo step. Typing in a text box, holding an
 * arrow key, dragging a slider or scrubbing a label changes the document
 * many times; this keeps those changes inside a single edit-session
 * gesture, so the timeline and preview follow live while undo sees one
 * step. The gesture also ends when the pointer goes down anywhere else, so
 * it can never linger into somebody else's drag.
 * @module utils/inspector/gesture
 */

import { beginGesture, cancelGesture, commit, edit, endGesture } from '#utils/editor/session.js';

/** @typedef {(doc: any) => any} Operation */

/** @type {{ key: string, base: any, element: Element|null }|null} */
let active = null;

/**
 * A press outside the field being edited ends the gesture first.
 * @param {Event} event
 */
function handleOutsidePress(event) {
  const inside =
    active?.element && event.target instanceof Node && active.element.contains(event.target);
  if (!inside) finishEdit();
}

/**
 * A live change from a field: previewed now, recorded when the interaction ends.
 * @param {string} key - Identifies the field; a different key starts a new step
 * @param {Operation} operation - Applied to the document the interaction started from
 * @param {Element|null} [element] - The field, so presses inside it keep the gesture open
 */
export function liveEdit(key, operation, element = null) {
  if (active?.key !== key) {
    finishEdit();
    active = { key, base: beginGesture(), element };
    window.addEventListener('pointerdown', handleOutsidePress, true);
  }
  commit(operation(active.base));
}

/**
 * End the current interaction, recording its undo step.
 * @returns {boolean} true when it changed the document
 */
export function finishEdit() {
  if (!active) return false;
  active = null;
  window.removeEventListener('pointerdown', handleOutsidePress, true);
  return endGesture();
}

/** Abandon the current interaction and restore the document it started from. */
export function cancelEdit() {
  if (!active) return;
  active = null;
  window.removeEventListener('pointerdown', handleOutsidePress, true);
  cancelGesture();
}

/**
 * The final value of an interaction (Enter, blur, pointer up, a button).
 * Closes the live gesture of that field if there is one; otherwise it is
 * an ordinary single edit.
 * @param {string} key
 * @param {Operation} operation
 * @returns {boolean} true when the document changed
 */
export function commitEdit(key, operation) {
  if (active?.key === key) {
    commit(operation(active.base));
    return finishEdit();
  }
  finishEdit();
  return edit(operation);
}

/** @returns {string} Key of the field being edited live, '' when none */
export const editingKey = () => active?.key || '';
