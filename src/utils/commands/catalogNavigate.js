/**
 * Command catalog — the Vegas ways of playing and of moving the cursor:
 * play from the start, J K L shuttle, to the ends of the time selection,
 * by pixel and by grid mark, to a numbered marker, to a typed time.
 * @module utils/commands/catalogNavigate
 */

import { commandsFor } from './catalogKit.js';
import * as nav from './navigate.js';
import { shuttle, shuttlePause } from './shuttleRun.js';
import { askGoToTime } from './viewCommands.js';

const play = commandsFor('Playback');
const go = commandsFor('Navigate');

/** Number keys: 1…9 then 0 for the tenth marker. */
const MARKER_COMMANDS = Array.from({ length: 10 }, (_, i) =>
  go(
    `go.marker${i + 1}`,
    `Go to marker ${i + 1}`,
    [String((i + 1) % 10)],
    () => nav.goToMarker(i + 1),
    {
      enabled: () => nav.markerTime(i + 1) !== undefined,
    },
  ),
);

/** @type {import('./registry.js').Command[]} */
export const NAVIGATE_COMMANDS = [
  play('transport.playFromStart', 'Play from the start', ['Shift+Space'], nav.playFromStart),
  play('transport.shuttleBack', 'Shuttle backwards (again: faster)', [], () => shuttle(-1), {
    icon: 'rewind',
  }),
  play('transport.shuttlePause', 'Shuttle pause (the cursor stays there)', [], shuttlePause),
  play('transport.shuttleForward', 'Shuttle forwards (again: faster)', [], () => shuttle(1), {
    icon: 'fast-forward',
  }),
  go('go.selectionStart', 'Go to the start of the time selection (or view)', ['Shift+Home'], () =>
    nav.goToSelectionEdge('start'),
  ),
  go('go.selectionEnd', 'Go to the end of the time selection (or view)', ['Shift+End'], () =>
    nav.goToSelectionEdge('end'),
  ),
  go('go.pixelLeft', 'Cursor one pixel left', ['Alt+ArrowLeft'], () => nav.stepPixel(-1)),
  go('go.pixelRight', 'Cursor one pixel right', ['Alt+ArrowRight'], () => nav.stepPixel(1)),
  go('go.gridLeft', 'Cursor to the previous grid mark', ['PageUp'], () => nav.stepGrid(-1)),
  go('go.gridRight', 'Cursor to the next grid mark', ['PageDown'], () => nav.stepGrid(1)),
  ...MARKER_COMMANDS,
  go('go.toTime', 'Go to a time…', ['Mod+G'], askGoToTime),
];
