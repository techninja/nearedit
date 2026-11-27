/**
 * Command catalog — the clipboard, selection, grouping and linking.
 * @module utils/commands/catalogClips
 */

import { getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import * as clipboard from './clipboard.js';
import * as select from './select.js';

/** @typedef {import('./registry.js').Command} Command */

const hasSelection = () => getSelection().length > 0;
const hasClips = () => getDoc().tracks.some((track) => track.clips.length > 0);

/** @type {Command[]} */
export const CLIP_COMMANDS = [
  {
    id: 'edit.cut',
    label: 'Cut',
    group: 'Edit',
    keys: ['Mod+X'],
    run: clipboard.cutSelection,
    enabled: hasSelection,
  },
  {
    id: 'edit.copy',
    label: 'Copy',
    group: 'Edit',
    keys: ['Mod+C'],
    run: clipboard.copySelection,
    enabled: hasSelection,
    icon: 'copy',
  },
  {
    id: 'edit.paste',
    label: 'Paste at cursor',
    group: 'Edit',
    keys: ['Mod+V'],
    run: clipboard.paste,
    enabled: clipboard.hasClipboard,
    icon: 'paste',
  },
  {
    id: 'edit.duplicate',
    label: 'Duplicate',
    group: 'Edit',
    keys: ['Mod+D'],
    run: clipboard.duplicateSelection,
    enabled: hasSelection,
    icon: 'duplicate',
  },
  {
    id: 'select.all',
    label: 'Select all',
    group: 'Selection',
    keys: ['Mod+A'],
    run: select.selectAllClips,
    enabled: hasClips,
  },
  {
    id: 'select.none',
    label: 'Select none',
    group: 'Selection',
    keys: ['Escape', 'Mod+Shift+A'],
    run: select.selectNone,
    enabled: select.canSelectNone,
  },
  {
    id: 'clip.group',
    label: 'Group',
    group: 'Selection',
    keys: ['G'],
    run: select.groupSelection,
    enabled: () => getSelection().length > 1,
    icon: 'group',
  },
  {
    id: 'clip.ungroup',
    label: 'Ungroup',
    group: 'Selection',
    keys: ['U'],
    run: select.ungroupSelection,
    enabled: select.selectionIsGrouped,
    icon: 'ungroup',
  },
  {
    id: 'clip.link',
    label: 'Link picture and sound',
    group: 'Selection',
    keys: ['Shift+L'],
    run: select.linkSelection,
    enabled: () => select.linkablePair() !== null,
    icon: 'link',
  },
  {
    id: 'clip.unlink',
    label: 'Unlink picture and sound',
    group: 'Selection',
    keys: ['Shift+U'],
    run: select.unlinkSelection,
    enabled: select.selectionIsLinked,
    icon: 'unlink',
  },
];
