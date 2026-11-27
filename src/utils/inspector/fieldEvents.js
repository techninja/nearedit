/**
 * The inspector's one event: every field, whatever it is made of, reports a
 * change as a bubbling `field-change` with `{ name, value, phase }`. The
 * inspector organism listens once and edits the document. Handlers here
 * adapt native inputs (which carry their field path in `data-name`).
 * @module utils/inspector/fieldEvents
 */

import { dispatch } from 'hybrids';

/** @typedef {'live'|'commit'|'cancel'} ChangePhase */
/** @typedef {{ name: string, value: any, phase: ChangePhase }} FieldChangeDetail */

/**
 * Report a field change.
 * @param {HTMLElement} host
 * @param {string} name - Field path or action
 * @param {any} [value]
 * @param {ChangePhase} [phase='commit'] - `live` while an interaction is
 *   under way, `commit` for its final value, `cancel` to abandon it
 */
export function emitChange(host, name, value, phase = 'commit') {
  dispatch(host, 'field-change', { detail: { name, value, phase }, bubbles: true });
}

/**
 * `oninput` of a text box, range slider or colour well: a live change.
 * @param {HTMLElement} host
 * @param {Event} event
 */
export function handleLiveInput(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  emitChange(
    host,
    input.dataset.name,
    input.type === 'range' ? Number(input.value) : input.value,
    'live',
  );
}

/**
 * `onchange` of a text box, range slider, colour well or select: the final value.
 * @param {HTMLElement} host
 * @param {Event} event
 */
export function handleCommitInput(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  emitChange(host, input.dataset.name, input.type === 'range' ? Number(input.value) : input.value);
}

/**
 * `onchange` of a checkbox.
 * @param {HTMLElement} host
 * @param {Event} event
 */
export function handleToggle(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  emitChange(host, input.dataset.name, input.checked);
}

/**
 * `onclick` of a button that sets a value or runs an action: `data-name`
 * is the field or action, `data-value` the value (when it sets one).
 * @param {HTMLElement} host
 * @param {Event} event
 */
export function handleButton(host, event) {
  const button = /** @type {HTMLElement} */ (event.currentTarget);
  const { name, value, type } = button.dataset;
  emitChange(host, name, type === 'boolean' ? value === 'true' : value);
}

/**
 * `onkeydown` of a text box: typing never reaches the editor's shortcuts,
 * Escape abandons the edit, Enter (in a one-line box) finishes it.
 * @param {HTMLElement} host
 * @param {KeyboardEvent} event
 */
export function handleTextKeys(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  if (event.key === 'Escape') {
    emitChange(host, input.dataset.name, undefined, 'cancel');
    input.blur();
  } else if (event.key === 'Enter' && input.tagName === 'INPUT') input.blur();
}

/**
 * `onkeydown` on a panel root: keys pressed while typing in any field stay
 * in the panel instead of triggering editor shortcuts.
 * @param {HTMLElement} _host
 * @param {KeyboardEvent} event
 */
export function containTyping(_host, event) {
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.matches?.('input, textarea, select, [contenteditable]')) event.stopPropagation();
}
