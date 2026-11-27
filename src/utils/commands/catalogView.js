/**
 * Command catalog — zoom, track heights, the editing-mode toggles, the
 * focused track and help.
 * @module utils/commands/catalogView
 */

import { getUserPrefs } from '#store/UserPrefs.js';
import { getView } from '#utils/editor/view.js';
import { commandsFor } from './catalogKit.js';
import * as tracks from './tracks.js';
import * as view from './viewCommands.js';

const mode = commandsFor('Modes');
const look = commandsFor('View');

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
  mode('mode.snapMarkers', 'Snap to markers and regions', ['Shift+F8'], view.toggleSnapMarkers, {
    pressed: () => getUserPrefs().snapMarkers,
  }),
  // Every edit lands on a frame (EDL.md); the Vegas key is listed so it reads as "on".
  mode('mode.quantize', 'Quantise to frames (always on)', ['Alt+F8'], () => true, {
    enabled: () => false,
    pressed: () => true,
  }),
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
  look('view.zoomInLarge', 'Zoom in, large step', ['Ctrl+ArrowUp'], view.zoomInLarge),
  look('view.zoomOutLarge', 'Zoom out, large step', ['Ctrl+ArrowDown'], view.zoomOutLarge),
  look('view.centerCursor', 'Centre the view on the cursor', ['|'], view.centerOnCursor),
  look('view.tracksTaller', 'Taller tracks', ['Ctrl+Shift+ArrowUp'], tracks.tracksTaller),
  look('view.tracksShorter', 'Shorter tracks', ['Ctrl+Shift+ArrowDown'], tracks.tracksShorter),
  look('view.minimizeTracks', 'Minimise / restore track heights', ['`'], tracks.minimizeTracks, {
    pressed: tracks.tracksAreMinimized,
  }),
  look(
    'track.muteFocused',
    'Mute the focused track',
    [],
    () => tracks.toggleFocusedTrack('muted'),
    {
      enabled: tracks.hasFocusedTrack,
      pressed: () => tracks.focusedTrackHas('muted'),
    },
  ),
  look('track.soloFocused', 'Solo the focused track', [], () => tracks.toggleFocusedTrack('solo'), {
    enabled: tracks.hasFocusedTrack,
    pressed: () => tracks.focusedTrackHas('solo'),
  }),
  {
    id: 'help.shortcuts',
    label: 'Keyboard shortcuts',
    group: 'View',
    keys: ['?'],
    run: view.showShortcuts,
    icon: 'keyboard',
  },
];
