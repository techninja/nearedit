/**
 * Keymap presets: complete layouts the user chooses between in the
 * shortcuts dialog. `nearedit` is the layout the commands themselves carry
 * (`command.keys`); `vegas` follows Vegas Pro. The user's own overrides
 * (`localStorage.nearedit_keymap`) apply on top of whichever is active. Pure.
 * @module utils/keyboard/presets
 */

import { VEGAS_TRANSPORT_KEYS } from './vegasKeys.js';
import { VEGAS_EDIT_KEYS } from './vegasKeysEdit.js';

/** @typedef {'nearedit'|'vegas'} PresetId */

/** @type {{ id: PresetId, label: string, about: string }[]} */
export const PRESETS = [
  { id: 'nearedit', label: 'NearEdit', about: 'The layout NearEdit ships with' },
  {
    id: 'vegas',
    label: 'Vegas',
    about: 'Vegas Pro defaults: arrows zoom, J K L shuttle, F ripples',
  },
];

/** @type {Record<string, string[]>} The Vegas preset: command id → shortcuts */
export const VEGAS_KEYS = { ...VEGAS_TRANSPORT_KEYS, ...VEGAS_EDIT_KEYS };

/**
 * @param {unknown} id
 * @returns {PresetId} A known preset id; `nearedit` for anything else
 */
export function presetId(id) {
  return PRESETS.some((preset) => preset.id === id) ? /** @type {PresetId} */ (id) : 'nearedit';
}

/**
 * The commands with the shortcuts of a preset, ready for `buildKeymap`.
 * @param {{ id: string, keys: string[] }[]} commands - The registry
 * @param {unknown} preset
 * @returns {{ id: string, keys: string[] }[]}
 */
export function presetCommands(commands, preset) {
  if (presetId(preset) !== 'vegas') return commands;
  return commands.map((command) => ({ id: command.id, keys: VEGAS_KEYS[command.id] || [] }));
}
