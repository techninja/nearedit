/**
 * Keyboard shortcuts for the editor, driven by the command registry.
 * `initKeyboard()` starts listening, `destroyKeyboard()` stops. A keystroke
 * is only ever taken (preventDefault) when it maps to a command that is
 * available right now; everything else is left to the browser, and keys
 * typed into fields, buttons, sliders, menus and dialogs are never touched;
 * while a modal dialog is open the shortcuts are off altogether.
 * The layout is a preset (`presets.js`) plus the user's own remapping in
 * `localStorage.nearedit_keymap` (format: `keymap.js`); see `active.js`.
 * @module utils/keyboard
 */

import { isEnabled, runCommand } from '#utils/commands/registry.js';
import { isPlaying } from '#utils/playback/transport.js';
import { activeKeymap, mac } from './active.js';
import { eventCombo } from './combo.js';
import { browserOwnsClipboardKey, controlOwnsKey, modalIsOpen } from './focus.js';
import { KEYMAP_STORAGE_KEY } from './keymap.js';
import { panKeyDown, panKeyReset, panKeyUp } from './panKey.js';

export { KEYMAP_STORAGE_KEY };
export {
  getKeymap,
  getPreset,
  overrideConflicts,
  setKeymap,
  setPreset,
  shortcutLabel,
  shortcutLabels,
} from './active.js';

/** Commands that run again while their key is held down, by id prefix. */
const REPEATING = [
  ...['transport.step', 'edit.nudge', 'edit.undo', 'edit.redo', 'event.', 'select.extend'],
  ...['go.previous', 'go.next', 'go.pixel', 'go.grid', 'view.zoom', 'view.tracks'],
];
/** @type {(id: string) => boolean} */
const repeats = (id) => REPEATING.some((prefix) => id.startsWith(prefix));
const PAN_KEY = 'Space';

let listening = false;
let suspended = 0;

/** @param {KeyboardEvent} event */
function onKeyDown(event) {
  if (event.defaultPrevented || event.isComposing || suspended || modalIsOpen()) return;
  const combo = eventCombo(event);
  if (!combo || controlOwnsKey(event.target, combo)) return;
  const id = activeKeymap().byCombo.get(combo);
  const usable = !!id && isEnabled(id);
  if (combo === PAN_KEY) {
    event.preventDefault(); // never scroll the page; the hold may become a pan
    if (!event.repeat) panKeyDown(usable ? () => runCommand(id) : null, isPlaying());
    return;
  }
  if (!usable || browserOwnsClipboardKey(combo, mac)) return;
  event.preventDefault();
  if (!event.repeat || repeats(id)) runCommand(id);
}

/** @param {KeyboardEvent} event */
function onKeyUp(event) {
  if (event.key === ' ') panKeyUp();
}

/** Start handling shortcuts (idempotent). Call when the editor opens. */
export function initKeyboard() {
  if (listening) return;
  listening = true;
  activeKeymap();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', panKeyReset);
}

/** Stop handling shortcuts. Call when the editor closes. */
export function destroyKeyboard() {
  listening = false;
  panKeyReset();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', panKeyReset);
}

/**
 * Pause shortcut handling, e.g. while a modal dialog is open.
 * @returns {() => void} Call to resume
 */
export function suspendKeyboard() {
  suspended++;
  let done = false;
  return () => {
    if (!done) suspended--;
    done = true;
  };
}
