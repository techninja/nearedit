/**
 * Behaviour of the token editor (`<brand-token-editor>`). Its fields
 * report a change as the inspector's fields do — a bubbling `field-change`
 * with `{ name, value, phase }`, `name` being the token's path — and it
 * adds two events of its own: `token-reset` (`{ path }`: the token follows
 * its kit again) and `token-file` (`{ path, file }`: a logo or a font file
 * was chosen).
 * @module utils/brandUi/tokenEditorEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';

/**
 * @typedef {Object} TokenEditorHost
 * @property {Record<string, Record<string, any>>} tokens - Every token, as the preview draws it
 * @property {Record<string, Record<string, any>>} changed - The tokens the draft sets
 * @property {import('#utils/brand/fontTable.js').FontFace[]} fonts - Font files at hand
 * @property {Record<string, string>} notes - Remarks by token path (readability)
 * @property {string} problem - Why the last file could not be taken
 */

/** @typedef {TokenEditorHost & HTMLElement} Host */

/** @type {(event: Event) => HTMLElement} */
const control = (event) => /** @type {HTMLElement} */ (event.currentTarget);

/** A token goes back to what its kit says. @param {Host} host @param {Event} event */
export function handleReset(host, event) {
  dispatch(host, 'token-reset', { detail: { path: control(event).dataset.path }, bubbles: true });
}

/** A select whose values are numbers (a font's weight). @param {Host} host @param {Event} event */
export function handleNumberChoice(host, event) {
  const select = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  emitChange(host, select.dataset.name, Number(select.value));
}

/** "Choose a file…": open the picker that belongs to the button. @param {Host} host @param {Event} event */
export function handlePick(host, event) {
  const { path } = control(event).dataset;
  /** @type {HTMLInputElement|null} */ (
    host.querySelector(`input[type="file"][data-path="${path}"]`)
  )?.click();
}

/** A file was picked. @param {Host} host @param {Event} event */
export function handleFile(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const [file] = input.files || [];
  if (file)
    dispatch(host, 'token-file', { detail: { path: input.dataset.path, file }, bubbles: true });
  input.value = ''; // the same file can be picked again
}

/** "Remove" beside a logo: the kit has none. @param {Host} host @param {Event} event */
export function handleClear(host, event) {
  emitChange(host, control(event).dataset.path, '');
}

/** Typing in a text token; keys stay in the box. @param {Host} _host @param {KeyboardEvent} event */
export function handleKeys(_host, event) {
  event.stopPropagation();
  if (event.key === 'Enter') /** @type {HTMLElement} */ (event.target).blur();
}
