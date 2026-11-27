/**
 * The active keymap: the preset chosen in the shortcuts dialog (kept in
 * `UserPrefs`) with the user's overrides from `localStorage.nearedit_keymap`
 * on top. Rebuilt whenever either changes; everything that shows or handles
 * a shortcut asks here.
 * @module utils/keyboard/active
 */

import { store } from 'hybrids';
import UserPrefs, { setUserPrefs } from '#store/UserPrefs.js';
import { COMMANDS } from '#utils/commands/registry.js';
import { formatCombo } from './comboFormat.js';
import { isMacPlatform } from './focus.js';
import {
  KEYMAP_STORAGE_KEY,
  buildKeymap,
  findConflicts,
  keymapToObject,
  parseOverrides,
} from './keymap.js';
import { presetCommands, presetId } from './presets.js';

export const mac = isMacPlatform();
/** @type {import('./keymap.js').Keymap|null} */
let keymap = null;
/** Preset the keymap was built for. */
let builtFor = '';
/** @type {Record<string, unknown>|null} The user's overrides; null = not read yet */
let overrides = null;

/** @returns {import('./presets.js').PresetId} The preset in use */
export const getPreset = () => presetId(store.get(UserPrefs).keymapPreset);

/** @returns {Record<string, unknown>} The user's overrides, read once */
export function getOverrides() {
  if (overrides) return overrides;
  let stored = null;
  try {
    stored = globalThis.localStorage?.getItem(KEYMAP_STORAGE_KEY);
  } catch (err) {
    console.warn('[keyboard] could not read the stored keymap:', err.message);
  }
  overrides = parseOverrides(stored);
  return overrides;
}

/** @returns {import('./keymap.js').Keymap} The keymap for the preset in use */
export function activeKeymap() {
  const preset = getPreset();
  if (!keymap || preset !== builtFor) {
    keymap = buildKeymap(presetCommands(COMMANDS, preset), getOverrides(), mac);
    builtFor = preset;
  }
  return keymap;
}

/**
 * Choose a preset. It is saved with the user's preferences and applies as
 * soon as that write lands (the next microtask).
 * @param {string} id - `nearedit` or `vegas`
 */
export function setPreset(id) {
  setUserPrefs({ keymapPreset: presetId(id) });
}

/** @returns {Record<string, string[]>} The effective keymap: command id → combos */
export const getKeymap = () => keymapToObject(activeKeymap());

/**
 * Replace the user's overrides, save them and apply them at once.
 * @param {Record<string, string|string[]>} next - `{}` restores the preset
 */
export function setKeymap(next) {
  overrides = next || {};
  keymap = null;
  try {
    globalThis.localStorage?.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('[keyboard] could not save the keymap:', err.message);
  }
}

/**
 * Keys one of the user's overrides took from another command of the preset
 * in use — shown as warnings in the shortcuts dialog.
 * @returns {import('./keymap.js').Conflict[]}
 */
export function overrideConflicts() {
  const commands = presetCommands(COMMANDS, getPreset());
  return findConflicts(commands, getOverrides(), mac).filter((conflict) => conflict.byUser);
}

/**
 * The shortcuts of a command, formatted for display.
 * @param {string} commandId
 * @returns {string[]} e.g. `['Ctrl+Shift+Z', 'Ctrl+Y']`; empty when unbound
 */
export function shortcutLabels(commandId) {
  return (activeKeymap().byCommand.get(commandId) || []).map((combo) => formatCombo(combo, mac));
}

/**
 * @param {string} commandId
 * @returns {string} The first shortcut, or ''
 */
export const shortcutLabel = (commandId) => shortcutLabels(commandId)[0] || '';
