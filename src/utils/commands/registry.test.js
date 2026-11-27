import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { addMarker } from '#utils/edl/index.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { buildKeymap } from '#utils/keyboard/keymap.js';
import { editPoints, markerTimes, neighbourPoint } from './editPoints.js';
import { COMMANDS, commandGroups, getCommand, isEnabled, isPressed, runCommand } from './index.js';

describe('command registry', () => {
  it('describes every command completely, with unique ids', () => {
    const ids = COMMANDS.map((command) => command.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length >= 45, `${ids.length} commands`);
    for (const command of COMMANDS) {
      assert.match(command.id, /^[a-z]+\.[A-Za-z0-9]+$/);
      assert.ok(command.label && command.group, command.id);
      assert.equal(typeof command.run, 'function', command.id);
      assert.ok(Array.isArray(command.keys), command.id);
    }
  });

  it('binds the keyboard table of the spec', () => {
    const { byCombo } = buildKeymap(COMMANDS);
    const table = {
      Space: 'transport.playPause',
      Enter: 'transport.playPauseInPlace',
      J: 'transport.rewind',
      K: 'transport.stop',
      L: 'transport.forward',
      Home: 'transport.goToStart',
      End: 'transport.goToEnd',
      ArrowLeft: 'transport.stepBack',
      ArrowRight: 'transport.stepForward',
      'Ctrl+Z': 'edit.undo',
      'Ctrl+Shift+Z': 'edit.redo',
      S: 'edit.split',
      Delete: 'edit.delete',
      Backspace: 'edit.delete',
      'Ctrl+C': 'edit.copy',
      'Ctrl+X': 'edit.cut',
      'Ctrl+V': 'edit.paste',
      'Ctrl+D': 'edit.duplicate',
      'Ctrl+A': 'select.all',
      M: 'marker.add',
      G: 'clip.group',
      '+': 'view.zoomIn',
      '-': 'view.zoomOut',
    };
    for (const [combo, id] of Object.entries(table)) assert.equal(byCombo.get(combo), id, combo);
    assert.equal(
      buildKeymap(COMMANDS, {}, true).byCombo.get('Meta+Z'),
      'edit.undo',
      'Cmd on macOS',
    );
    assert.equal(buildKeymap(COMMANDS, {}, true).byCombo.get('Shift+Meta+Z'), 'edit.redo');
  });

  it('gives no default shortcut to two commands', () => {
    for (const mac of [false, true]) {
      const { byCommand } = buildKeymap(COMMANDS, {}, mac);
      for (const command of COMMANDS) {
        assert.equal(
          byCommand.get(command.id).length,
          command.keys.length,
          `${command.id} lost a key`,
        );
      }
    }
  });

  it('never claims a key the browser needs for itself', () => {
    const { byCombo } = buildKeymap(COMMANDS);
    for (const combo of ['Ctrl+R', 'Ctrl+T', 'Ctrl+W', 'Ctrl+L', 'Ctrl+P', 'Ctrl+S', 'F5', 'Tab']) {
      assert.equal(byCombo.has(combo), false, combo);
    }
  });

  it('runs a command only when it is available', async () => {
    session.loadDoc(testEdl({ v1: [testClip('a', 0, 4)] }));
    await store.set(ViewState, { selection: [], cursorPosition: 2, ripple: false });
    assert.equal(isEnabled('edit.delete'), false);
    assert.equal(runCommand('edit.delete'), false);
    assert.equal(runCommand('no.such'), false);
    assert.equal(isEnabled('edit.undo'), false);
    assert.equal(isEnabled('edit.split'), true);
    assert.equal(runCommand('edit.split'), true);
    assert.equal(session.getDoc().tracks[0].clips.length, 2);
    assert.equal(isEnabled('edit.undo'), true);
    assert.equal(isEnabled('go.nextMarker'), false, 'no markers');
    session.edit((doc) => addMarker(doc, 3));
    assert.equal(isEnabled('go.nextMarker'), true);
  });

  it('reports the state of toggles', async () => {
    await store.set(ViewState, { snapping: true, ripple: false });
    assert.equal(isPressed('mode.snapping'), true);
    assert.equal(isPressed('mode.ripple'), false);
    runCommand('mode.ripple');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(isPressed('mode.ripple'), true);
    assert.equal(isPressed('edit.split'), false, 'not a toggle');
    assert.equal(getCommand('mode.ripple').label, 'Ripple editing');
  });

  it('groups commands for the shortcuts list', () => {
    const groups = commandGroups();
    assert.deepEqual(
      groups.map((entry) => entry.group),
      ['Playback', 'Navigate', 'Edit', 'Selection', 'Insert', 'Modes', 'View'],
    );
    assert.equal(
      groups.reduce((n, entry) => n + entry.commands.length, 0),
      COMMANDS.length,
    );
  });
});

describe('edit points', () => {
  const doc = addMarker(
    addMarker(
      testEdl({ v1: [testClip('a', 0, 4), testClip('b', 4, 9)], a1: [testClip('s', 2, 9)] }),
      7,
    ),
    1,
  );

  it('lists every clip edge once, in order', () => {
    assert.deepEqual(editPoints(doc), [0, 2, 4, 9]);
    assert.deepEqual(markerTimes(doc), [1, 7]);
  });

  it('finds the neighbour strictly before or after a time', () => {
    const points = editPoints(doc);
    assert.equal(neighbourPoint(points, 3, 1), 4);
    assert.equal(neighbourPoint(points, 4, 1), 9, 'not the point we are on');
    assert.equal(neighbourPoint(points, 4, -1), 2);
    assert.equal(neighbourPoint(points, 0, -1), null);
    assert.equal(neighbourPoint(points, 9, 1), null);
    assert.equal(neighbourPoint([], 1, 1), null);
  });
});
