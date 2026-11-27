/**
 * Command catalog — playback and navigation (the spec's keyboard table and
 * the jumps between edit points and markers).
 * @module utils/commands/catalogTransport
 */

import { getDoc } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import * as nav from './navigate.js';

/** @typedef {import('./registry.js').Command} Command */

const hasMarkers = () => (getDoc().markers || []).length > 0;

/** @type {Command[]} */
export const TRANSPORT_COMMANDS = [
  {
    id: 'transport.playPause',
    label: 'Play / stop (return to cursor)',
    group: 'Playback',
    keys: ['Space'],
    run: nav.playPause,
    icon: 'play',
  },
  {
    id: 'transport.playPauseInPlace',
    label: 'Play / pause in place',
    group: 'Playback',
    keys: ['Enter'],
    run: nav.playPauseInPlace,
    icon: 'pause',
  },
  { id: 'transport.rewind', label: 'Rewind 2 s', group: 'Playback', keys: ['J'], run: nav.rewind },
  {
    id: 'transport.stop',
    label: 'Stop (return to cursor)',
    group: 'Playback',
    keys: ['K'],
    run: nav.stop,
    icon: 'stop',
  },
  {
    id: 'transport.forward',
    label: 'Forward 2 s',
    group: 'Playback',
    keys: ['L'],
    run: nav.forward,
  },
  {
    id: 'transport.goToStart',
    label: 'Go to start',
    group: 'Playback',
    keys: ['Home'],
    run: nav.goToStart,
    icon: 'skip-back',
  },
  {
    id: 'transport.goToEnd',
    label: 'Go to end',
    group: 'Playback',
    keys: ['End'],
    run: nav.goToEnd,
    icon: 'skip-forward',
  },
  {
    id: 'transport.stepBack',
    label: 'Previous frame',
    group: 'Playback',
    keys: ['ArrowLeft'],
    run: () => nav.stepFrames(-1),
    icon: 'step-back',
  },
  {
    id: 'transport.stepForward',
    label: 'Next frame',
    group: 'Playback',
    keys: ['ArrowRight'],
    run: () => nav.stepFrames(1),
    icon: 'step-forward',
  },
  {
    id: 'transport.stepBack10',
    label: 'Back 10 frames',
    group: 'Playback',
    keys: ['Shift+ArrowLeft'],
    run: () => nav.stepFrames(-10),
  },
  {
    id: 'transport.stepForward10',
    label: 'Forward 10 frames',
    group: 'Playback',
    keys: ['Shift+ArrowRight'],
    run: () => nav.stepFrames(10),
  },
  {
    id: 'transport.toggleLoop',
    label: 'Loop playback',
    group: 'Playback',
    keys: ['Q'],
    run: nav.toggleLoop,
    pressed: () => getView().loopEnabled,
    icon: 'loop',
  },
  {
    id: 'go.previousEdit',
    label: 'Previous edit point',
    group: 'Navigate',
    keys: ['ArrowUp'],
    run: nav.goToPreviousEdit,
  },
  {
    id: 'go.nextEdit',
    label: 'Next edit point',
    group: 'Navigate',
    keys: ['ArrowDown'],
    run: nav.goToNextEdit,
  },
  {
    id: 'go.previousMarker',
    label: 'Previous marker',
    group: 'Navigate',
    keys: ['Shift+ArrowUp'],
    run: nav.goToPreviousMarker,
    enabled: hasMarkers,
  },
  {
    id: 'go.nextMarker',
    label: 'Next marker',
    group: 'Navigate',
    keys: ['Shift+ArrowDown'],
    run: nav.goToNextMarker,
    enabled: hasMarkers,
  },
];
