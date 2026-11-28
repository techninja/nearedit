/**
 * Behaviour of the inspector's "Brand element" group
 * (`<element-inspector>`): its fields fill the blanks of the selected
 * element clips (one undo step per visit to a field), its buttons bring
 * clips up to date with the project's kit and detach them from it, and
 * after a clip was added its first field takes the keyboard.
 * @module utils/brandUi/inspectorEvents
 */

import { getDoc } from '#utils/editor/session.js';
import { confirmAction } from '#utils/ui/confirm.js';
import { elementSubject } from './elementSubject.js';
import { changeSlot, detachElements } from './slotEdits.js';
import { takeSlotFocus } from './slotFocus.js';
import { staleInfo, updateToBrand } from './stale.js';

/**
 * @typedef {Object} ElementInspectorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {import('./kitState.js').KitState} kit - The project's kit
 */

/** @typedef {ElementInspectorHost & HTMLElement} Host */

/** What detaching means, said before it is done. */
export const DETACH_WARNING = [
  'It becomes ordinary clips — its text, shapes and pictures on tracks of their own, grouped — that you can change freely.',
  'It will no longer follow the brand: “Update to brand” leaves it alone. Its position, size and opacity are kept; its own fades, effects and keyframes are not.',
].join('\n\n');

/**
 * @param {{ model: ElementInspectorHost['model'], kit: ElementInspectorHost['kit'] }} host
 * @returns {import('./elementSubject.js').ElementSubject|null} What the group
 *   is about; null when no element clip is selected
 */
export function subjectOf({ model, kit }) {
  const stale = staleInfo(getDoc(), kit.effective);
  return elementSubject(model.refs || [], kit.effective, stale.byClip);
}

/**
 * A field says what its blank holds now. Handled here, not reported as a
 * `field-change`: a report from this element itself would go straight to
 * the inspector, which would take the blank's name for a path of the clip.
 * @param {Host} host
 * @param {Event} event
 * @param {import('./slotEdits.js').Phase} phase
 */
function fill(host, event, phase) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  const subject = subjectOf(host);
  if (subject) changeSlot(subject.clipIds, input.dataset.slot, input.value, phase, input);
}

/** Typing in a blank: shown at once. @param {Host} host @param {Event} event */
export const handleSlotInput = (host, event) => fill(host, event, 'live');

/** A blank was left (or Enter pressed): the visit becomes one undo step. @param {Host} host @param {Event} event */
export const handleSlotCommit = (host, event) => fill(host, event, 'commit');

/**
 * Keys in a blank never reach the editor's shortcuts; Escape puts back
 * what it held, Enter in a one-line blank finishes it.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleSlotKeys(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  event.stopPropagation();
  if (event.key === 'Escape') {
    fill(host, event, 'cancel');
    input.blur();
  } else if (event.key === 'Enter' && input.tagName === 'INPUT') input.blur();
}

/** "Update to brand": the selected clips. @param {Host} host */
export function handleUpdate(host) {
  const subject = subjectOf(host);
  if (subject?.outdated.length) updateToBrand(subject.outdated);
}

/** "Update all": every out-of-date clip of the timeline. */
export function handleUpdateAll() {
  updateToBrand();
}

/** "Detach…": say what it means, then do it. @param {Host} host */
export async function handleDetach(host) {
  const subject = subjectOf(host);
  if (!subject || subject.locked) return;
  const many = subject.clipIds.length > 1;
  const sure = await confirmAction({
    title: many
      ? `Detach ${subject.clipIds.length} elements from the brand?`
      : 'Detach from the brand?',
    message: DETACH_WARNING,
    confirmLabel: 'Detach',
    cancelLabel: 'Keep as it is',
  });
  if (sure) await detachElements(subject.clipIds);
}

/**
 * After every render: a clip that was just added gets the keyboard in its
 * first field, what it starts with selected, so typing replaces it.
 * @param {Host} host
 */
export function focusNewClip(host) {
  const subject = subjectOf(host);
  if (subject?.clipIds.length !== 1 || !subject.fields.length) return;
  if (!takeSlotFocus(subject.clipIds[0])) return;
  // The tab that holds the inspector may still be on its way in.
  requestAnimationFrame(() => {
    const field = /** @type {HTMLInputElement|null} */ (host.querySelector('[data-slot]'));
    field?.focus({ preventScroll: false });
    field?.select();
  });
}
