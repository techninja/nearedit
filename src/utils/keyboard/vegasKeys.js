/**
 * The Vegas preset, part 1 — transport, cursor and time selection, as Vegas
 * Pro binds them. A command that is not listed has no key in this preset.
 * `Mod` (Ctrl, or Cmd on macOS) is used only where every program agrees
 * (clipboard, undo); the rest say `Ctrl`, which is what Vegas means.
 * What the browser keeps for itself, and the alternates: docs/app-spec/VEGAS.md.
 * @module utils/keyboard/vegasKeys
 */

/** Number keys 1…9, 0 jump to markers 1…10. */
const MARKER_KEYS = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`go.marker${i + 1}`, [String((i + 1) % 10)]]),
);

/** @type {Record<string, string[]>} Command id → shortcuts */
export const VEGAS_TRANSPORT_KEYS = {
  'transport.playPause': ['Space'],
  'transport.playPauseInPlace': ['Enter'],
  'transport.playFromStart': ['Shift+Space'],
  'transport.shuttleBack': ['J'],
  'transport.shuttlePause': ['K'],
  'transport.shuttleForward': ['L'],
  'transport.toggleLoop': ['Q'],
  'transport.goToStart': ['Ctrl+Home', 'W'],
  'transport.goToEnd': ['Ctrl+End', 'E'],
  'transport.stepBack': ['Alt+ArrowLeft', 'F3'],
  'transport.stepForward': ['Alt+ArrowRight', 'F9'],

  'go.selectionStart': ['Home'],
  'go.selectionEnd': ['End'],
  'go.pixelLeft': ['ArrowLeft'],
  'go.pixelRight': ['ArrowRight'],
  'go.previousMarker': ['Ctrl+ArrowLeft'],
  'go.nextMarker': ['Ctrl+ArrowRight'],
  'go.previousEdit': ['Ctrl+Alt+ArrowLeft'],
  'go.nextEdit': ['Ctrl+Alt+ArrowRight'],
  'go.gridLeft': ['PageUp'],
  'go.gridRight': ['PageDown'],
  ...MARKER_KEYS,
  'go.toTime': ['Ctrl+G'],
  'view.centerCursor': ['\\'],

  'select.markIn': ['I'],
  'select.markOut': ['O'],
  'select.extendLeft': ['Shift+ArrowLeft'],
  'select.extendRight': ['Shift+ArrowRight'],
  'select.extendPreviousEdit': ['Ctrl+Alt+Shift+ArrowLeft'],
  'select.extendNextEdit': ['Ctrl+Alt+Shift+ArrowRight'],
  'select.recall': ['Backspace'],
  'marker.addNamed': ['M'],
  'region.add': ['R'],

  'view.zoomIn': ['ArrowUp', '+', '='],
  'view.zoomOut': ['ArrowDown', '-'],
  'view.zoomInLarge': ['Ctrl+ArrowUp'],
  'view.zoomOutLarge': ['Ctrl+ArrowDown'],
  'view.tracksTaller': ['Ctrl+Shift+ArrowUp'],
  'view.tracksShorter': ['Ctrl+Shift+ArrowDown'],
  'view.minimizeTracks': ['`'],
  'view.zoomFit': ['|'],
  'help.shortcuts': ['?', 'F1'],
};
