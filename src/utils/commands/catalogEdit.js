/**
 * Command catalog — undo / redo, splitting, deleting, trimming and nudging.
 * @module utils/commands/catalogEdit
 */

import { canRedo, canUndo, redo, undo } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import * as edits from './edit.js';

/** @typedef {import('./registry.js').Command} Command */

const hasSelection = () => getSelection().length > 0;
const group = 'Edit';

/** @type {Command[]} */
export const EDIT_COMMANDS = [
  {
    id: 'edit.undo',
    label: 'Undo',
    group,
    keys: ['Mod+Z'],
    run: undo,
    enabled: canUndo,
    icon: 'undo',
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    group,
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    run: redo,
    enabled: canRedo,
    icon: 'redo',
  },
  {
    id: 'edit.split',
    label: 'Split at cursor',
    group,
    keys: ['S'],
    run: edits.splitAtCursor,
    enabled: edits.canSplit,
    icon: 'split',
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    group,
    keys: ['Delete', 'Backspace'],
    run: edits.deleteSelection,
    enabled: hasSelection,
    icon: 'trash',
  },
  {
    id: 'edit.rippleDelete',
    label: 'Ripple delete (close the gap)',
    group,
    keys: ['Shift+Delete', 'Shift+Backspace'],
    run: edits.rippleDeleteSelection,
    enabled: hasSelection,
    icon: 'minimize',
  },
  {
    id: 'edit.trimStart',
    label: 'Trim start to cursor',
    group,
    keys: ['['],
    run: edits.trimStartToCursor,
    enabled: hasSelection,
  },
  {
    id: 'edit.trimEnd',
    label: 'Trim end to cursor',
    group,
    keys: [']'],
    run: edits.trimEndToCursor,
    enabled: hasSelection,
  },
  {
    id: 'edit.nudgeLeft',
    label: 'Nudge 1 frame earlier',
    group,
    keys: [','],
    run: () => edits.nudgeSelection(-1),
    enabled: hasSelection,
  },
  {
    id: 'edit.nudgeRight',
    label: 'Nudge 1 frame later',
    group,
    keys: ['.'],
    run: () => edits.nudgeSelection(1),
    enabled: hasSelection,
  },
  {
    id: 'edit.nudgeLeft10',
    label: 'Nudge 10 frames earlier',
    group,
    keys: ['<'],
    run: () => edits.nudgeSelection(-10),
    enabled: hasSelection,
  },
  {
    id: 'edit.nudgeRight10',
    label: 'Nudge 10 frames later',
    group,
    keys: ['>'],
    run: () => edits.nudgeSelection(10),
    enabled: hasSelection,
  },
];
