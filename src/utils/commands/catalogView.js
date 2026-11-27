/**
 * Command catalog — zoom, the editing-mode toggles and help.
 * @module utils/commands/catalogView
 */

import { getView } from '#utils/editor/view.js';
import * as view from './viewCommands.js';

/** @typedef {import('./registry.js').Command} Command */

/** @type {Command[]} */
export const VIEW_COMMANDS = [
  {
    id: 'mode.snapping',
    label: 'Snapping',
    group: 'Modes',
    keys: ['N'],
    run: view.toggleSnapping,
    pressed: () => getView().snapping,
    icon: 'snap',
  },
  {
    id: 'mode.ripple',
    label: 'Ripple editing',
    group: 'Modes',
    keys: ['R'],
    run: view.toggleRipple,
    pressed: () => getView().ripple,
    icon: 'ripple',
  },
  {
    id: 'mode.autoCrossfade',
    label: 'Automatic cross-fades',
    group: 'Modes',
    keys: ['X'],
    run: view.toggleAutoCrossfade,
    pressed: () => getView().autoCrossfade,
    icon: 'crossfade',
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    group: 'View',
    keys: ['-'],
    run: view.zoomOut,
    icon: 'zoom-out',
  },
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    group: 'View',
    keys: ['+', '='],
    run: view.zoomIn,
    icon: 'zoom-in',
  },
  {
    id: 'view.zoomFit',
    label: 'Zoom to fit',
    group: 'View',
    keys: ['\\'],
    run: view.zoomToFit,
    icon: 'maximize',
  },
  {
    id: 'help.shortcuts',
    label: 'Keyboard shortcuts',
    group: 'View',
    keys: ['?'],
    run: view.showShortcuts,
    icon: 'keyboard',
  },
];
