/**
 * What the caption style editor does with what its controls report: a
 * `field-change` named `captions.style.<path>` changes that field of the
 * timeline's style (`patchCaptionStyle`), live changes inside one gesture
 * so that a drag of a slider is a single undo step; a tile sets the preset;
 * "Back to preset" drops what differs.
 * @module utils/captionsUi/styleEvents
 */

import { getDoc } from '#utils/editor/session.js';
import { patchCaptionStyle } from '#utils/edl/index.js';
import { cancelEdit, commitEdit, liveEdit } from '#utils/inspector/gesture.js';
import { arrowFocus } from '#utils/ui/focus.js';
import { STYLE_PREFIX, presetOf } from './styleControls.js';

/**
 * A control of the style reported a change.
 * @param {Event} event - A `field-change` (`#utils/inspector/fieldEvents.js`)
 */
export function handleStyleField(event) {
  const { name, value, phase } = /** @type {CustomEvent} */ (event).detail || {};
  if (typeof name !== 'string' || !name.startsWith(`${STYLE_PREFIX}.`)) return;
  // The inspector listens for the same event: this one is not about a clip.
  event.stopPropagation();
  if (phase === 'cancel') return cancelEdit();
  const path = name.slice(STYLE_PREFIX.length + 1);
  /** @type {(doc: any) => any} */
  const operation = (doc) => patchCaptionStyle(doc, path, value);
  if (phase === 'live') liveEdit(name, operation, /** @type {Element} */ (event.target));
  else commitEdit(name, operation);
}

/**
 * Listen for the style's controls on the element that holds them.
 * @param {HTMLElement} host
 * @returns {() => void} Stop listening
 */
export function listenForStyle(host) {
  host.addEventListener('field-change', handleStyleField);
  return () => host.removeEventListener('field-change', handleStyleField);
}

/**
 * Choose a preset, as it comes: what differed from the one before is dropped.
 * @param {string} name
 * @returns {boolean} False when the timeline already has exactly that
 */
export function choosePreset(name) {
  return commitEdit(`${STYLE_PREFIX}.preset`, (doc) => patchCaptionStyle(doc, 'preset', name));
}

/** A tile was pressed. @param {HTMLElement} _host @param {Event} event */
export function handleTile(_host, event) {
  choosePreset(/** @type {HTMLElement} */ (event.currentTarget).dataset.preset);
}

/** "Back to preset": the preset in use, without what was changed. */
export function handleBackToPreset() {
  choosePreset(presetOf(getDoc().captions?.style).name);
}

/**
 * Arrow keys move between the tiles; Enter and Space press the one in focus.
 * @param {HTMLElement} host
 * @param {KeyboardEvent} event
 */
export function handleTileKeys(host, event) {
  const tiles = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.captions-style-tile')]);
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  if (arrowFocus(tiles, event, { horizontal })) event.stopPropagation();
}

/**
 * The font dropdown changed.
 * @param {HTMLElement} _host
 * @param {Event} event
 */
export function handleFont(_host, event) {
  const { value } = /** @type {HTMLSelectElement} */ (event.target);
  event.stopPropagation();
  commitEdit(`${STYLE_PREFIX}.font.family`, (doc) => patchCaptionStyle(doc, 'font.family', value));
}
