/**
 * Command catalog — captions: switch them on or off for the selection,
 * caption all speech, open the style. Joins the Edit group of the
 * registry, so the shortcuts list, the context menus and the keyboard find
 * them like any other command. Loading it also registers the "CC" badge.
 * @module utils/captionsUi/commands
 */

import { commandsFor } from '#utils/commands/catalogKit.js';
import {
  canCaptionSelection,
  captionAll,
  selectionIsCaptioned,
  toggleSelectionCaptions,
} from './actions.js';
import './badge.js';
import { openCaptionStyle } from './styleView.js';

/** @typedef {import('#utils/commands/registry.js').Command} Command */

const change = commandsFor('Edit');

/** @type {Command[]} */
export const CAPTION_COMMANDS = [
  change('captions.toggle', 'Captions on / off', ['Alt+C'], toggleSelectionCaptions, {
    enabled: canCaptionSelection,
    pressed: selectionIsCaptioned,
    icon: 'captions',
  }),
  change('captions.all', 'Caption all speech', ['Alt+Shift+C'], () => void captionAll(), {
    icon: 'captions',
  }),
  change('captions.style', 'Caption style…', [], openCaptionStyle),
];
