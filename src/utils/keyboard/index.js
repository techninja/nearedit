/**
 * Keyboard shortcuts for the editor, driven by the command registry.
 * `initKeyboard()` starts listening, `destroyKeyboard()` stops. A keystroke
 * is only ever taken (preventDefault) when it maps to a command that is
 * available right now; everything else is left to the browser, and keys
 * typed into fields, buttons, sliders, menus and dialogs are never touched;
 * while a modal dialog is open the shortcuts are off altogether.
 * Remap through `localStorage.nearedit_keymap` (format: `keymap.js`).
 * @module utils/keyboard
 */

import { COMMANDS, isEnabled, runCommand } from '#utils/commands/registry.js';
import { isPlaying } from '#utils/playback/transport.js';
import { eventCombo, formatCombo } from './combo.js';
import { browserOwnsClipboardKey, controlOwnsKey, isMacPlatform, modalIsOpen } from './focus.js';
import { KEYMAP_STORAGE_KEY, buildKeymap, keymapToObject, parseOverrides } from './keymap.js';
import { panKeyDown, panKeyReset, panKeyUp } from './panKey.js';

export { KEYMAP_STORAGE_KEY };

/** Commands that run again while their key is held down. */
const REPEATING = /^(transport\.step|edit\.nudge|edit\.undo|edit\.redo|view\.zoom(In|Out)|go\.)/;
const PAN_KEY = 'Space';

const mac = isMacPlatform();
/** @type {import('./keymap.js').Keymap|null} */
let keymap = null;
let listening = false;
let suspended = 0;

/** @returns {import('./keymap.js').Keymap} The keymap, loaded on first use */
function current() {
  if (!keymap) {
    let stored = null;
    try {
      stored = globalThis.localStorage?.getItem(KEYMAP_STORAGE_KEY);
    } catch (err) {
      console.warn('[keyboard] could not read the stored keymap:', err.message);
    }
    keymap = buildKeymap(COMMANDS, parseOverrides(stored), mac);
  }
  return keymap;
}

/** @param {KeyboardEvent} event */
function onKeyDown(event) {
  if (event.defaultPrevented || event.isComposing || suspended || modalIsOpen()) return;
  const combo = eventCombo(event);
  if (!combo || controlOwnsKey(event.target, combo)) return;
  const id = current().byCombo.get(combo);
  const usable = !!id && isEnabled(id);
  if (combo === PAN_KEY) {
    event.preventDefault(); // never scroll the page; the hold may become a pan
    if (!event.repeat) panKeyDown(usable ? () => runCommand(id) : null, isPlaying());
    return;
  }
  if (!usable || browserOwnsClipboardKey(combo, mac)) return;
  event.preventDefault();
  if (!event.repeat || REPEATING.test(id)) runCommand(id);
}

/** @param {KeyboardEvent} event */
function onKeyUp(event) {
  if (event.key === ' ') panKeyUp();
}

/** Start handling shortcuts (idempotent). Call when the editor opens. */
export function initKeyboard() {
  if (listening) return;
  listening = true;
  current();
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

/** @returns {Record<string, string[]>} The effective keymap: command id → combos */
export const getKeymap = () => keymapToObject(current());

/**
 * Replace the user's overrides, save them and apply them at once.
 * @param {Record<string, string|string[]>} overrides - `{}` restores the defaults
 */
export function setKeymap(overrides) {
  keymap = buildKeymap(COMMANDS, overrides, mac);
  try {
    globalThis.localStorage?.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('[keyboard] could not save the keymap:', err.message);
  }
}

/**
 * The shortcuts of a command, formatted for display.
 * @param {string} commandId
 * @returns {string[]} e.g. `['Ctrl+Shift+Z', 'Ctrl+Y']`; empty when unbound
 */
export function shortcutLabels(commandId) {
  return (current().byCommand.get(commandId) || []).map((combo) => formatCombo(combo, mac));
}

/**
 * @param {string} commandId
 * @returns {string} The first shortcut, or ''
 */
export const shortcutLabel = (commandId) => shortcutLabels(commandId)[0] || '';
