import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '#utils/commands/registry.js';
import { eventCombo, formatCombo, normalizeCombo } from './combo.js';
import { editorKeepsChord } from './focus.js';
import { buildKeymap, findConflicts } from './keymap.js';
import { PRESETS, VEGAS_KEYS, presetCommands, presetId } from './presets.js';

/** The layout phase 1 shipped: every command it had, with its keys. */
const PHASE_1 = {
  'transport.playPause': ['Space'],
  'transport.playPauseInPlace': ['Enter'],
  'transport.rewind': ['J'],
  'transport.stop': ['K'],
  'transport.forward': ['L'],
  'transport.goToStart': ['Home'],
  'transport.goToEnd': ['End'],
  'transport.stepBack': ['ArrowLeft'],
  'transport.stepForward': ['ArrowRight'],
  'transport.stepBack10': ['Shift+ArrowLeft'],
  'transport.stepForward10': ['Shift+ArrowRight'],
  'transport.toggleLoop': ['Q'],
  'go.previousEdit': ['ArrowUp'],
  'go.nextEdit': ['ArrowDown'],
  'go.previousMarker': ['Shift+ArrowUp'],
  'go.nextMarker': ['Shift+ArrowDown'],
  'edit.undo': ['Mod+Z'],
  'edit.redo': ['Mod+Shift+Z', 'Mod+Y'],
  'edit.split': ['S'],
  'edit.delete': ['Delete', 'Backspace'],
  'edit.rippleDelete': ['Shift+Delete', 'Shift+Backspace'],
  'edit.trimStart': ['['],
  'edit.trimEnd': [']'],
  'edit.nudgeLeft': [','],
  'edit.nudgeRight': ['.'],
  'edit.nudgeLeft10': ['<'],
  'edit.nudgeRight10': ['>'],
  'edit.cut': ['Mod+X'],
  'edit.copy': ['Mod+C'],
  'edit.paste': ['Mod+V'],
  'edit.duplicate': ['Mod+D'],
  'select.all': ['Mod+A'],
  'select.none': ['Escape', 'Mod+Shift+A'],
  'clip.group': ['G'],
  'clip.ungroup': ['U'],
  'clip.link': ['Shift+L'],
  'clip.unlink': ['Shift+U'],
  'marker.add': ['M'],
  'title.add': ['T'],
  'track.addVideo': [],
  'track.addAudio': [],
  'mode.snapping': ['N'],
  'mode.ripple': ['R'],
  'mode.autoCrossfade': ['X'],
  'view.zoomOut': ['-'],
  'view.zoomIn': ['+', '='],
  'view.zoomFit': ['\\'],
  'help.shortcuts': ['?'],
};
const byId = new Map(COMMANDS.map((command) => [command.id, command]));
const vegas = presetCommands(COMMANDS, 'vegas');

describe('keymap presets', () => {
  it('keeps the NearEdit preset exactly as phase 1 had it', () => {
    assert.equal(Object.keys(PHASE_1).length, 48);
    for (const [id, keys] of Object.entries(PHASE_1)) {
      assert.deepEqual(byId.get(id)?.keys, keys, id);
    }
    assert.equal(presetCommands(COMMANDS, 'nearedit'), COMMANDS);
    assert.equal(presetCommands(COMMANDS, 'no such preset'), COMMANDS);
    const { byCombo } = buildKeymap(COMMANDS);
    for (const [id, keys] of Object.entries(PHASE_1)) {
      for (const key of keys) assert.equal(byCombo.get(normalizeCombo(key)), id, key);
    }
  });

  it('names its presets and falls back to NearEdit', () => {
    assert.deepEqual(
      PRESETS.map((preset) => preset.id),
      ['nearedit', 'vegas'],
    );
    assert.equal(presetId('vegas'), 'vegas');
    assert.equal(presetId(undefined), 'nearedit');
    assert.equal(presetId('premiere'), 'nearedit');
  });

  it('binds only commands that exist, and no key twice, in either preset', () => {
    for (const id of Object.keys(VEGAS_KEYS)) assert.ok(byId.has(id), `unknown command ${id}`);
    for (const mac of [false, true]) {
      assert.deepEqual(findConflicts(COMMANDS, {}, mac), [], `NearEdit, mac ${mac}`);
      assert.deepEqual(findConflicts(vegas, {}, mac), [], `Vegas, mac ${mac}`);
    }
  });

  it('lays the Vegas preset out as Vegas does', () => {
    const { byCombo } = buildKeymap(vegas);
    const table = {
      Space: 'transport.playPause',
      Enter: 'transport.playPauseInPlace',
      'Shift+Space': 'transport.playFromStart',
      J: 'transport.shuttleBack',
      K: 'transport.shuttlePause',
      L: 'transport.shuttleForward',
      Q: 'transport.toggleLoop',
      'Ctrl+Home': 'transport.goToStart',
      W: 'transport.goToStart',
      'Ctrl+End': 'transport.goToEnd',
      Home: 'go.selectionStart',
      End: 'go.selectionEnd',
      ArrowLeft: 'go.pixelLeft',
      'Alt+ArrowRight': 'transport.stepForward',
      F3: 'transport.stepBack',
      F9: 'transport.stepForward',
      'Ctrl+ArrowLeft': 'go.previousMarker',
      'Ctrl+Alt+ArrowRight': 'go.nextEdit',
      PageUp: 'go.gridLeft',
      PageDown: 'go.gridRight',
      1: 'go.marker1',
      0: 'go.marker10',
      'Ctrl+G': 'go.toTime',
      '\\': 'view.centerCursor',
      I: 'select.markIn',
      O: 'select.markOut',
      'Shift+ArrowRight': 'select.extendRight',
      'Ctrl+Alt+Shift+ArrowLeft': 'select.extendPreviousEdit',
      Backspace: 'select.recall',
      ArrowUp: 'view.zoomIn',
      ArrowDown: 'view.zoomOut',
      'Ctrl+ArrowUp': 'view.zoomInLarge',
      'Ctrl+Shift+ArrowDown': 'view.tracksShorter',
      '`': 'view.minimizeTracks',
      S: 'edit.split',
      'Ctrl+T': 'edit.trimToSelection',
      'Alt+T': 'edit.trimToSelection',
      'Alt+[': 'edit.trimStart',
      'Alt+]': 'edit.trimEnd',
      Delete: 'edit.delete',
      'Ctrl+Shift+V': 'edit.pasteInsert',
      'Ctrl+B': 'edit.pasteRepeat',
      'Ctrl+Shift+A': 'select.none',
      G: 'clip.group',
      U: 'clip.removeFromGroup',
      'Shift+G': 'select.group',
      'Ctrl+Y': 'edit.redo',
      'Ctrl+L': 'mode.ripple',
      F: 'ripple.postTracks',
      'Ctrl+F': 'ripple.postMarks',
      'Ctrl+Shift+F': 'ripple.postAll',
      F8: 'mode.snapping',
      'Shift+F8': 'mode.snapMarkers',
      'Alt+F8': 'mode.quantize',
      'Ctrl+Shift+X': 'mode.autoCrossfade',
      M: 'marker.addNamed',
      R: 'region.add',
      'Ctrl+Shift+Q': 'track.addVideo',
      'Alt+Shift+Q': 'track.addVideo',
      'Ctrl+Q': 'track.addAudio',
      'Alt+Q': 'track.addAudio',
      Z: 'track.muteFocused',
      X: 'track.soloFocused',
      Num4: 'event.nudgeLeftPixel',
      Num6: 'event.nudgeRightPixel',
      Num1: 'edit.nudgeLeft',
      Num3: 'edit.nudgeRight',
      Num8: 'event.moveUp',
      Num2: 'event.moveDown',
      '[': 'trim.selectStart',
      Num7: 'trim.selectStart',
      ']': 'trim.selectEnd',
      Num9: 'trim.selectEnd',
      Num5: 'trim.exit',
    };
    for (const [combo, id] of Object.entries(table)) assert.equal(byCombo.get(combo), id, combo);
    assert.equal(byCombo.has('Ctrl+D'), false, 'Vegas: Ctrl+D is a tool, not duplicate');
    assert.equal(byCombo.has('Ctrl+W'), false, 'the browser closes the tab with it');
    assert.equal(buildKeymap(vegas, {}, true).byCombo.get('Meta+Z'), 'edit.undo', 'Cmd on macOS');
    assert.equal(
      buildKeymap(vegas, {}, true).byCombo.get('Ctrl+L'),
      'mode.ripple',
      'Ctrl stays Ctrl',
    );
  });

  it('applies the user overrides on top of whichever preset is active', () => {
    const overrides = { 'edit.split': 'C', 'Ctrl+B': 'edit.split', 'marker.addNamed': '' };
    for (const commands of [COMMANDS, vegas]) {
      const { byCombo, byCommand } = buildKeymap(commands, overrides);
      assert.equal(byCombo.get('C'), 'edit.split');
      assert.equal(byCombo.has('S'), false);
      assert.equal(byCombo.get('Ctrl+B'), 'edit.split');
      assert.deepEqual(byCommand.get('marker.addNamed'), []);
      assert.deepEqual(byCommand.get('edit.pasteRepeat'), [], 'its key was taken');
    }
    assert.equal(buildKeymap(vegas, overrides).byCombo.get('W'), 'transport.goToStart');
  });
});

describe('conflict detection', () => {
  const commands = [
    { id: 'a', keys: ['A', 'Mod+K'] },
    { id: 'b', keys: ['B'] },
    { id: 'c', keys: [] },
  ];

  it('finds nothing in a clean layout', () => {
    assert.deepEqual(findConflicts(commands), []);
    assert.deepEqual(findConflicts(commands, { c: 'X', 'Ctrl+J': 'b' }), []);
  });

  it('flags an override that takes a key from another command', () => {
    assert.deepEqual(findConflicts(commands, { c: 'A' }), [
      { combo: 'A', commandId: 'c', others: ['a'], byUser: true },
    ]);
    assert.deepEqual(findConflicts(commands, { 'ctrl+k': 'b' }), [
      { combo: 'Ctrl+K', commandId: 'b', others: ['a'], byUser: true },
    ]);
    assert.deepEqual(findConflicts(commands, { 'ctrl+k': 'b' }, true), [], 'Mod is Cmd on macOS');
  });

  it('flags two overrides on one key, and a preset that clashes with itself', () => {
    const [clash] = findConflicts(commands, { b: 'Z', c: 'Z' });
    assert.deepEqual([clash.combo, clash.commandId, clash.others], ['Z', 'c', ['b']]);
    const twice = [...commands, { id: 'd', keys: ['B'] }];
    assert.deepEqual(findConflicts(twice), [
      { combo: 'B', commandId: 'b', others: ['d'], byUser: false },
    ]);
  });

  it('gives an override that replaces a command its keys back when it frees one', () => {
    assert.deepEqual(findConflicts(commands, { a: 'Q', c: 'A' }), [], 'a no longer asks for A');
  });
});

describe('combos for the Vegas keys', () => {
  it('tells the keypad from the number row, whatever NumLock does', () => {
    assert.equal(eventCombo({ key: '4', code: 'Numpad4' }), 'Num4');
    assert.equal(eventCombo({ key: 'ArrowLeft', code: 'Numpad4' }), 'Num4');
    assert.equal(eventCombo({ key: '4', code: 'Digit4' }), '4');
    assert.equal(eventCombo({ key: 'Clear', code: 'Numpad5', ctrlKey: true }), 'Ctrl+Num5');
    assert.equal(normalizeCombo('numpad7'), 'Num7');
    assert.equal(normalizeCombo('Ctrl+num4'), 'Ctrl+Num4');
    assert.equal(formatCombo('Num4'), 'Num 4');
  });

  it('reads function keys, and punctuation under Alt by the physical key', () => {
    assert.equal(normalizeCombo('shift+f8'), 'Shift+F8');
    assert.equal(eventCombo({ key: 'F8', code: 'F8', altKey: true }), 'Alt+F8');
    assert.equal(eventCombo({ key: '“', code: 'BracketLeft', altKey: true }), 'Alt+[');
    assert.equal(eventCombo({ key: '≤', code: 'Comma', altKey: true }), 'Alt+,');
    assert.equal(eventCombo({ key: '[', code: 'BracketLeft' }), '[');
    assert.equal(eventCombo({ key: '|', code: 'Backslash', shiftKey: true }), '|');
    assert.equal(eventCombo({ key: '`', code: 'Backquote' }), '`');
    assert.equal(normalizeCombo('Shift+Ins'), 'Shift+Insert');
    assert.equal(formatCombo('Ctrl+Alt+Shift+ArrowLeft'), 'Ctrl+Alt+Shift+←');
    assert.equal(formatCombo('PageUp'), 'PgUp');
    assert.equal(formatCombo('Ctrl++'), 'Ctrl++');
    assert.equal(formatCombo('+'), '+');
    assert.equal(formatCombo('Shift+Meta+Z', true), '⇧⌘Z');
  });

  it('keeps a bound chord from the browser, except the text family', () => {
    for (const combo of ['Ctrl+U', 'Ctrl+Shift+A', 'Alt+ArrowLeft', 'Ctrl+F', 'Alt+T', 'Meta+G']) {
      assert.equal(editorKeepsChord(combo), true, combo);
    }
    for (const combo of [
      'Ctrl+C',
      'Ctrl+V',
      'Ctrl+A',
      'Ctrl+Z',
      'Ctrl+Shift+Z',
      'Meta+X',
      'Shift+Meta+Z',
    ]) {
      assert.equal(editorKeepsChord(combo), false, combo);
    }
    for (const combo of ['F', 'Shift+G', 'F8', 'Delete', 'Num5']) {
      assert.equal(editorKeepsChord(combo), false, `${combo} is not a chord`);
    }
  });
});
