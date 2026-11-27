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
 * Sort the user's overrides into replaced commands and extra bindings.
 * @param {{ id: string, keys: string[] }[]} commands
 * @param {Record<string, unknown>} overrides
 * @param {boolean} mac
 * @returns {{ replaced: Map<string, string[]>, extra: [string, string][] }}
 */
function readOverrides(commands, overrides, mac) {
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
  return { replaced, extra };
}

/**
 * Build the keymap.
 * @param {{ id: string, keys: string[] }[]} commands - The registry, or the
 *   commands of a preset (`presetCommands`)
 * @param {Record<string, unknown>} [overrides] - See the module description
 * @param {boolean} [mac=false] - `Mod` means Cmd
 * @returns {Keymap}
 */
export function buildKeymap(commands, overrides = {}, mac = false) {
  const { replaced, extra } = readOverrides(commands, overrides, mac);
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
 * A key that more than one command asks for.
 * @typedef {Object} Conflict
 * @property {string} combo - Canonical combo
 * @property {string} commandId - The command that gets the key
 * @property {string[]} others - Commands that ask for it too and go without
 * @property {boolean} byUser - One of the user's overrides is involved
 */

/**
 * Find the keys that are asked for twice: a user override that takes a key
 * another command had, or two defaults that clash (which a preset must not).
 * @param {{ id: string, keys: string[] }[]} commands
 * @param {Record<string, unknown>} [overrides]
 * @param {boolean} [mac=false]
 * @returns {Conflict[]}
 */
export function findConflicts(commands, overrides = {}, mac = false) {
  const { replaced, extra } = readOverrides(commands, overrides, mac);
  const { byCombo } = buildKeymap(commands, overrides, mac);
  /** @type {Map<string, { ids: Set<string>, byUser: boolean }>} */
  const asked = new Map();
  const ask = (combo, id, byUser) => {
    const entry = asked.get(combo) || { ids: new Set(), byUser: false };
    asked.set(combo, { ids: entry.ids.add(id), byUser: entry.byUser || byUser });
  };
  for (const { id, keys } of commands) {
    for (const combo of replaced.get(id) || comboList(keys, mac)) ask(combo, id, replaced.has(id));
  }
  for (const [combo, id] of extra) ask(combo, id, true);
  return [...asked]
    .filter(([, { ids }]) => ids.size > 1)
    .map(([combo, { ids, byUser }]) => {
      const commandId = byCombo.get(combo);
      return { combo, commandId, others: [...ids].filter((id) => id !== commandId), byUser };
    });
}

/**
 * The effective keymap as plain data (for a settings screen).
 * @param {Keymap} keymap
 * @returns {Record<string, string[]>} Command id → combos
 */
export function keymapToObject(keymap) {
  return Object.fromEntries(keymap.byCommand);
}
