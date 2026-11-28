/**
 * The command registry: one description per editor command — id, label,
 * default shortcuts, what it runs, when it is available. The toolbar, the
 * context menus, the keyboard handler and the shortcuts list are all
 * generated from it, so a command added here shows up everywhere.
 * @module utils/commands/registry
 */

import { BRAND_COMMANDS } from '#utils/brandUi/commands.js';
import { CLIP_COMMANDS } from './catalogClips.js';
import { EDIT_COMMANDS } from './catalogEdit.js';
import { EVENT_COMMANDS } from './catalogEvents.js';
import { FX_EDIT_COMMANDS, FX_INSERT_COMMANDS, FX_NAVIGATE_COMMANDS } from './catalogFx.js';
import { INSERT_COMMANDS } from './catalogInsert.js';
import { MUSIC_COMMANDS } from './catalogMusic.js';
import { NAVIGATE_COMMANDS } from './catalogNavigate.js';
import { SELECTION_COMMANDS } from './catalogSelection.js';
import { TRANSPORT_COMMANDS } from './catalogTransport.js';
import { VIEW_COMMANDS } from './catalogView.js';
import { WEB_COMMANDS } from './catalogWeb.js';

/**
 * @typedef {Object} Command
 * @property {string} id - Stable id, e.g. `edit.split`
 * @property {string} label - Shown in tooltips, menus and the shortcuts list
 * @property {string} group - Heading in the shortcuts list
 * @property {string[]} keys - Shortcuts in the NearEdit preset (`Mod` = Ctrl, or Cmd on
 *   macOS); other presets: `#utils/keyboard/presets.js`
 * @property {() => unknown} run
 * @property {() => boolean} [enabled] - Omitted = always available
 * @property {() => boolean} [pressed] - Toggles: whether the mode is on
 * @property {string} [icon] - Name of an `<app-icon>`
 */

/** @type {Command[]} Every command, in the order the shortcuts list shows them. */
export const COMMANDS = [
  ...TRANSPORT_COMMANDS,
  ...NAVIGATE_COMMANDS,
  ...FX_NAVIGATE_COMMANDS,
  ...EDIT_COMMANDS,
  ...FX_EDIT_COMMANDS,
  ...WEB_COMMANDS,
  ...MUSIC_COMMANDS,
  ...BRAND_COMMANDS,
  ...CLIP_COMMANDS,
  ...EVENT_COMMANDS,
  ...SELECTION_COMMANDS,
  ...INSERT_COMMANDS,
  ...FX_INSERT_COMMANDS,
  ...VIEW_COMMANDS,
];

/** @type {Map<string, Command>} */
const byId = new Map(COMMANDS.map((command) => [command.id, command]));

/**
 * @param {string} id
 * @returns {Command|undefined}
 */
export const getCommand = (id) => byId.get(id);

/**
 * @param {string} id
 * @returns {boolean} True when the command exists and may run now
 */
export function isEnabled(id) {
  const command = byId.get(id);
  return !!command && (!command.enabled || command.enabled());
}

/**
 * @param {string} id
 * @returns {boolean} True when the command is a toggle that is on
 */
export function isPressed(id) {
  return !!byId.get(id)?.pressed?.();
}

/**
 * Run a command if it is available.
 * @param {string} id
 * @returns {boolean} false when the command is unknown or not available —
 *   the caller should then leave the triggering event alone
 */
export function runCommand(id) {
  if (!isEnabled(id)) return false;
  byId.get(id).run();
  return true;
}

/**
 * Commands grouped under their headings, for the shortcuts list.
 * @returns {{ group: string, commands: Command[] }[]}
 */
export function commandGroups() {
  /** @type {Map<string, Command[]>} */
  const groups = new Map();
  for (const command of COMMANDS) {
    groups.set(command.group, [...(groups.get(command.group) || []), command]);
  }
  return [...groups].map(([group, commands]) => ({ group, commands }));
}
