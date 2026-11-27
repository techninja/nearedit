/**
 * Building the keymap: the default shortcuts of the command registry,
 * changed by the user's overrides from `localStorage.nearedit_keymap`.
 *
 * Overrides are a JSON object. Each entry either gives a command its
 * shortcuts — `{ "edit.split": "C", "edit.delete": ["Delete", "X"],
 * "marker.add": "" }` (an empty value unbinds) — or binds one more key to a
 * command — `{ "Ctrl+B": "edit.split" }`. A user binding always wins over a
 * default that uses the same key. Pure.
 * @module utils/keyboard/keymap
 */

import { normalizeCombo } from './combo.js';

export const KEYMAP_STORAGE_KEY = 'nearedit_keymap';

/**
 * @typedef {Object} Keymap
 * @property {Map<string, string>} byCombo - Canonical combo → command id
 * @property {Map<string, string[]>} byCommand - Command id → its combos
 */

/**
 * Parse stored overrides, tolerating anything.
 * @param {string|null|undefined} raw - JSON text
 * @returns {Record<string, string|string[]>} `{}` when missing or malformed
 */
export function parseOverrides(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn('[keyboard] ignoring a malformed nearedit_keymap:', err.message);
    return {};
  }
}

/**
 * @param {unknown} value
 * @param {boolean} mac
 * @returns {string[]} Canonical combos; unreadable entries are dropped
 */
function comboList(value, mac) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((text) => normalizeCombo(String(text ?? ''), mac)).filter(Boolean);
}

/**
 * Build the keymap.
 * @param {{ id: string, keys: string[] }[]} commands - The registry
 * @param {Record<string, unknown>} [overrides] - See the module description
 * @param {boolean} [mac=false] - `Mod` means Cmd
 * @returns {Keymap}
 */
export function buildKeymap(commands, overrides = {}, mac = false) {
  const known = new Set(commands.map((command) => command.id));
  /** @type {Map<string, string[]>} Commands whose shortcuts the user replaced */
  const replaced = new Map();
  /** @type {[string, string][]} Extra [combo, command] bindings */
  const extra = [];
  for (const [name, value] of Object.entries(overrides || {})) {
    if (known.has(name)) replaced.set(name, comboList(value, mac));
    else if (typeof value === 'string' && known.has(value)) {
      const combo = normalizeCombo(name, mac);
      if (combo) extra.push([combo, value]);
    }
  }

  /** @type {Map<string, string>} */
  const byCombo = new Map();
  /** Defaults never steal a key; user bindings do. */
  const bind = (combo, id, force) => {
    if (force || !byCombo.has(combo)) byCombo.set(combo, id);
  };
  for (const command of commands) {
    if (replaced.has(command.id)) continue;
    for (const combo of comboList(command.keys, mac)) bind(combo, command.id, false);
  }
  for (const [id, combos] of replaced) for (const combo of combos) bind(combo, id, true);
  for (const [combo, id] of extra) bind(combo, id, true);

  /** @type {Map<string, string[]>} */
  const byCommand = new Map(commands.map((command) => [command.id, []]));
  for (const [combo, id] of byCombo) byCommand.get(id).push(combo);
  return { byCombo, byCommand };
}

/**
 * The effective keymap as plain data (for a settings screen).
 * @param {Keymap} keymap
 * @returns {Record<string, string[]>} Command id → combos
 */
export function keymapToObject(keymap) {
  return Object.fromEntries(keymap.byCommand);
}
