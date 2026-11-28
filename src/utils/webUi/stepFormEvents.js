/**
 * Behaviour of the step form (`<web-step-form>`). Every control reports a
 * bubbling `field-change` (`{ name: 'steps.<n>.<field>', value, phase }`,
 * as the inspector's fields do): text follows live while it is typed and
 * is committed when the box is left — one undo step per field — numbers,
 * dropdowns and ticks at once. While a box has the focus it shows what was
 * typed, not what the recipe made of it (a recipe trims its targets).
 * @module utils/webUi/stepFormEvents
 */

import { dispatch } from 'hybrids';
import { emitChange } from '#utils/inspector/fieldEvents.js';
import { NOT_A_VALUE, readField } from './stepForm.js';

/**
 * @typedef {Object} StepFormHost
 * @property {import('./stepForm.js').FormField[]} fields
 * @property {number} index - The step the form is of
 * @property {string} heading - The step's kind, in words
 * @property {string} about - What that kind does
 * @property {string} picking - The field waiting for a press on the page view
 * @property {boolean} locked
 * @property {{ name: string, text: string }} draft - The box being typed in
 */

/** @typedef {StepFormHost & HTMLElement} Host */

const NO_DRAFT = { name: '', text: '' };

/** @type {(host: Host, event: Event) => import('./stepForm.js').FormField} */
const fieldOf = (host, event) => {
  const { name } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  return host.fields.find((field) => field.name === name);
};

/** @type {(host: Host, name: string) => string} */
const path = (host, name) => `steps.${host.index}.${name}`;

/** A box is typed in. @param {Host} host @param {Event} event */
export function handleInput(host, event) {
  const field = fieldOf(host, event);
  const text = /** @type {HTMLInputElement} */ (event.currentTarget).value;
  event.stopPropagation();
  host.draft = { name: field.name, text };
  const value = readField(field, text);
  if (field.spec.type !== 'number' && value !== NOT_A_VALUE)
    emitChange(host, path(host, field.name), value, 'live');
}

/** A box was left, or Enter pressed in it. @param {Host} host @param {Event} event */
export function handleChange(host, event) {
  const field = fieldOf(host, event);
  const value = readField(field, /** @type {HTMLInputElement} */ (event.currentTarget).value);
  event.stopPropagation();
  host.draft = NO_DRAFT;
  if (value !== NOT_A_VALUE) return emitChange(host, path(host, field.name), value);
  // Not a number: the box goes back to what the step has.
  /** @type {HTMLInputElement} */ (event.currentTarget).value = String(field.value ?? '');
  return undefined;
}

/**
 * Keys in a box: Enter finishes the edit; Escape abandons one that is
 * under way (and only then stays in the form, instead of closing the dialog).
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleKeys(host, event) {
  const box = /** @type {HTMLInputElement} */ (event.currentTarget);
  if (event.key === 'Enter' && box.tagName === 'INPUT') return box.blur();
  if (event.key !== 'Escape' || host.draft.name !== box.dataset.name) return undefined;
  event.stopPropagation();
  emitChange(host, path(host, box.dataset.name), undefined, 'cancel');
  host.draft = NO_DRAFT;
  box.value = String(fieldOf(host, event).value ?? '');
  return undefined;
}

/** A dropdown or a colour well changed. @param {Host} host @param {Event} event */
export function handleChoice(host, event) {
  const control = /** @type {HTMLSelectElement} */ (event.currentTarget);
  event.stopPropagation();
  emitChange(host, path(host, control.dataset.name), control.value);
}

/** A tick box changed. @param {Host} host @param {Event} event */
export function handleToggle(host, event) {
  const box = /** @type {HTMLInputElement} */ (event.currentTarget);
  event.stopPropagation();
  emitChange(host, path(host, box.dataset.name), box.checked);
}

/** One of several ticks (held keys) changed. @param {Host} host @param {Event} event */
export function handleMany(host, event) {
  const box = /** @type {HTMLInputElement} */ (event.currentTarget);
  const field = fieldOf(host, event);
  event.stopPropagation();
  const held = new Set(Array.isArray(field.value) ? field.value : []);
  if (box.checked) held.add(box.value);
  else held.delete(box.value);
  emitChange(host, path(host, field.name), [...held]);
}

/** "Pick" of a target box: the next press on the page view fills it in. @param {Host} host @param {Event} event */
export function handlePick(host, event) {
  const { name } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  dispatch(host, 'web-pick-field', { detail: { name }, bubbles: true });
}
