/**
 * Command catalog — the brand: open the Brand dialog, and bring element
 * clips up to date with the project's kit (all of them, or the selected
 * ones). Joins the Edit group of the registry, so the shortcuts list, the
 * context menus and the keyboard find them like any other command.
 * @module utils/brandUi/commands
 */

import { commandsFor } from '#utils/commands/catalogKit.js';
import { getSelection } from '#utils/editor/view.js';
import { openBrandDialog } from './dialogState.js';
import { staleInfo, updateToBrand } from './stale.js';

/** @typedef {import('#utils/commands/registry.js').Command} Command */

/** @returns {string[]} The selected clips an update would change */
export function staleSelection() {
  const outdated = new Set(staleInfo().outdated);
  return getSelection().filter((clipId) => outdated.has(clipId));
}

/** @returns {boolean} True when an element clip is out of date with the project's kit */
export const hasStaleElements = () => staleInfo().outdated.length > 0;

/** Bring every out-of-date element clip up to date: one undo step. @returns {boolean} */
export const updateAllElements = () => updateToBrand() > 0;

/** Bring the selected out-of-date element clips up to date. @returns {boolean} */
export const updateSelectedElements = () => updateToBrand(staleSelection()) > 0;

const change = commandsFor('Edit');

/** @type {Command[]} */
export const BRAND_COMMANDS = [
  change('brand.open', 'Brand…', ['Alt+B'], () => openBrandDialog(), { icon: 'palette' }),
  change('brand.updateAll', 'Update all elements to brand', [], updateAllElements, {
    enabled: hasStaleElements,
    icon: 'palette',
  }),
  change('brand.updateSelected', 'Update selected elements to brand', [], updateSelectedElements, {
    enabled: () => staleSelection().length > 0,
  }),
];
