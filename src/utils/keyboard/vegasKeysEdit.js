/**
 * The Vegas preset, part 2 — editing, ripple, modes, tracks and the event
 * keys of the numeric keypad. Where a browser keeps Vegas's key for itself
 * (Ctrl+T, Ctrl+Q, Ctrl+Shift+Q) an Alt alternate follows it, and keys that
 * need a keypad have a second binding for keyboards without one.
 * @module utils/keyboard/vegasKeysEdit
 */

/** @type {Record<string, string[]>} Command id → shortcuts */
export const VEGAS_EDIT_KEYS = {
  'edit.undo': ['Mod+Z', 'Alt+Backspace'],
  'edit.redo': ['Mod+Shift+Z', 'Mod+Y'],
  'edit.split': ['S'],
  'edit.delete': ['Delete'],
  'edit.trimToSelection': ['Ctrl+T', 'Alt+T'],
  'edit.trimStart': ['Alt+['],
  'edit.trimEnd': ['Alt+]'],
  'edit.cut': ['Mod+X', 'Shift+Delete'],
  'edit.copy': ['Mod+C', 'Ctrl+Insert'],
  'edit.paste': ['Mod+V', 'Shift+Insert'],
  'edit.pasteInsert': ['Mod+Shift+V'],
  'edit.pasteRepeat': ['Mod+B'],
  'select.all': ['Mod+A'],
  'select.none': ['Mod+Shift+A', 'Escape'],
  'clip.group': ['G'],
  'clip.removeFromGroup': ['U'],
  'clip.ungroup': ['Ctrl+U'],
  'select.group': ['Shift+G'],
  'clip.link': ['Shift+L'],
  'clip.unlink': ['Shift+U'],

  'mode.ripple': ['Ctrl+L'],
  'ripple.postTracks': ['F'],
  'ripple.postMarks': ['Ctrl+F'],
  'ripple.postAll': ['Ctrl+Shift+F'],
  'mode.snapping': ['F8'],
  'mode.snapMarkers': ['Shift+F8'],
  'mode.quantize': ['Alt+F8'],
  'mode.autoCrossfade': ['Ctrl+Shift+X'],

  'title.add': ['T'],
  'track.addVideo': ['Ctrl+Shift+Q', 'Alt+Shift+Q'],
  'track.addAudio': ['Ctrl+Q', 'Alt+Q'],
  'track.muteFocused': ['Z'],
  'track.soloFocused': ['X'],

  'event.nudgeLeftPixel': ['Num4', 'Alt+,'],
  'event.nudgeRightPixel': ['Num6', 'Alt+.'],
  'edit.nudgeLeft': ['Num1', ','],
  'edit.nudgeRight': ['Num3', '.'],
  'edit.nudgeLeft10': ['<'],
  'edit.nudgeRight10': ['>'],
  'event.moveUp': ['Num8', 'Ctrl+Alt+ArrowUp'],
  'event.moveDown': ['Num2', 'Ctrl+Alt+ArrowDown'],
  'trim.selectStart': ['[', 'Num7'],
  'trim.selectEnd': [']', 'Num9'],
  'trim.exit': ['Num5'],
};
