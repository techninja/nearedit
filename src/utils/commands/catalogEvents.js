/**
 * Command catalog — the special pastes, group membership, and the Vegas
 * "event keys": nudging by a pixel, moving to the track above or below,
 * and edge-trim mode.
 * @module utils/commands/catalogEvents
 */

import { getSelection } from '#utils/editor/view.js';
import { getEdgeTrim } from '#utils/timeline/edgeTrim.js';
import { commandsFor } from './catalogKit.js';
import { hasClipboard } from './clipboard.js';
import { pixelSeconds } from './context.js';
import { nudgeBy } from './edit.js';
import * as events from './eventKeys.js';
import { pasteInsertAtCursor } from './pasteSpecial.js';
import * as select from './select.js';
import { askPasteRepeat } from './viewCommands.js';

const edit = commandsFor('Edit');
const pick = commandsFor('Selection');

const hasSelection = () => getSelection().length > 0;
const up = ['Num8', 'Ctrl+Alt+ArrowUp'];
const down = ['Num2', 'Ctrl+Alt+ArrowDown'];

/** @type {import('./registry.js').Command[]} */
export const EVENT_COMMANDS = [
  edit(
    'edit.pasteInsert',
    'Paste insert (every track makes room)',
    ['Mod+Shift+V'],
    pasteInsertAtCursor,
    {
      enabled: hasClipboard,
      icon: 'insert',
    },
  ),
  edit('edit.pasteRepeat', 'Paste repeat…', ['Mod+B'], askPasteRepeat, { enabled: hasClipboard }),
  pick('select.group', 'Select the whole group', ['Shift+G'], select.selectWholeGroups, {
    enabled: hasSelection,
  }),
  pick('clip.removeFromGroup', 'Remove from the group', ['Alt+U'], select.removeFromGroup, {
    enabled: select.selectionIsGrouped,
  }),
  edit(
    'event.nudgeLeftPixel',
    'Nudge 1 pixel earlier',
    ['Num4', 'Alt+,'],
    () => nudgeBy(-pixelSeconds()),
    { enabled: hasSelection },
  ),
  edit(
    'event.nudgeRightPixel',
    'Nudge 1 pixel later',
    ['Num6', 'Alt+.'],
    () => nudgeBy(pixelSeconds()),
    {
      enabled: hasSelection,
    },
  ),
  edit('event.moveUp', 'Move to the track above', up, () => events.moveSelectionToTrack(-1), {
    enabled: hasSelection,
  }),
  edit('event.moveDown', 'Move to the track below', down, () => events.moveSelectionToTrack(1), {
    enabled: hasSelection,
  }),
  edit(
    'trim.selectStart',
    'Edge trim: take the start (again: the edge before)',
    ['Num7', 'Alt+['],
    () => events.selectEdge('start'),
    { enabled: events.canSelectEdge, icon: 'brackets' },
  ),
  edit(
    'trim.selectEnd',
    'Edge trim: take the end (again: the edge after)',
    ['Num9', 'Alt+]'],
    () => events.selectEdge('end'),
    { enabled: events.canSelectEdge, icon: 'brackets' },
  ),
  edit('trim.exit', 'Leave edge-trim mode', ['Num5'], events.leaveEdgeTrim, {
    enabled: () => !!getEdgeTrim(),
  }),
];
