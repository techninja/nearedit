import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eventCombo, formatCombo, normalizeCombo } from './combo.js';
import {
  browserOwnsClipboardKey,
  controlOwnsKey,
  modalIsOpen,
  releasePointerFocus,
} from './focus.js';
import { buildKeymap, keymapToObject, parseOverrides } from './keymap.js';
import { consumePanKey, isPanKeyHeld, panKeyDown, panKeyReset, panKeyUp } from './panKey.js';

describe('combos', () => {
  it('normalises written combos', () => {
    assert.equal(normalizeCombo('ctrl+shift+z'), 'Ctrl+Shift+Z');
    assert.equal(normalizeCombo('Shift+Ctrl+Z'), 'Ctrl+Shift+Z', 'modifier order is fixed');
    assert.equal(normalizeCombo('s'), 'S');
    assert.equal(normalizeCombo(' '), 'Space');
    assert.equal(normalizeCombo('space'), 'Space');
    assert.equal(normalizeCombo('Shift+Left'), 'Shift+ArrowLeft');
    assert.equal(normalizeCombo('del'), 'Delete');
    assert.equal(normalizeCombo('+'), '+');
    assert.equal(normalizeCombo('Ctrl++'), 'Ctrl++');
    assert.equal(normalizeCombo('Cmd+K'), 'Meta+K');
    assert.equal(normalizeCombo(''), '');
    assert.equal(normalizeCombo('Hyper+K'), '', 'unknown modifier');
  });

  it('resolves Mod to Ctrl, or Cmd on macOS', () => {
    assert.equal(normalizeCombo('Mod+Z'), 'Ctrl+Z');
    assert.equal(normalizeCombo('Mod+Z', true), 'Meta+Z');
    assert.equal(normalizeCombo('Mod+Shift+Z', true), 'Shift+Meta+Z');
  });

  it('drops Shift for symbols, whose key already says it', () => {
    assert.equal(normalizeCombo('Shift+?'), '?');
    assert.equal(normalizeCombo('Shift+<'), '<');
    assert.equal(normalizeCombo('Shift+L'), 'Shift+L', 'letters keep it');
  });

  it('reads keyboard events the same way', () => {
    assert.equal(eventCombo({ key: 's' }), 'S');
    assert.equal(eventCombo({ key: 'S', shiftKey: true }), 'Shift+S');
    assert.equal(eventCombo({ key: 'z', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Z');
    assert.equal(eventCombo({ key: ' ' }), 'Space');
    assert.equal(eventCombo({ key: '?', shiftKey: true }), '?');
    assert.equal(eventCombo({ key: '+', shiftKey: true }), '+');
    assert.equal(eventCombo({ key: 'ArrowLeft', shiftKey: true }), 'Shift+ArrowLeft');
    assert.equal(eventCombo({ key: 'z', metaKey: true }), 'Meta+Z');
    assert.equal(eventCombo({ key: 'Shift', shiftKey: true }), '', 'a bare modifier');
    assert.equal(eventCombo({ key: 'Control', ctrlKey: true }), '');
  });

  it('uses the physical key for Option combos on macOS', () => {
    assert.equal(eventCombo({ key: '¬', code: 'KeyL', altKey: true }), 'Alt+L');
    assert.equal(eventCombo({ key: '¡', code: 'Digit1', altKey: true }), 'Alt+1');
  });

  it('formats combos for people', () => {
    assert.equal(formatCombo('Ctrl+Shift+Z'), 'Ctrl+Shift+Z');
    assert.equal(formatCombo('Shift+Meta+Z', true), '⇧⌘Z');
    assert.equal(formatCombo('ArrowLeft'), '←');
    assert.equal(formatCombo('Shift+ArrowUp'), 'Shift+↑');
    assert.equal(formatCombo('Ctrl++'), 'Ctrl++');
    assert.equal(formatCombo('Escape'), 'Esc');
    assert.equal(formatCombo(''), '');
  });
});

describe('keymap', () => {
  const commands = [
    { id: 'edit.split', keys: ['S'] },
    { id: 'edit.undo', keys: ['Mod+Z'] },
    { id: 'edit.delete', keys: ['Delete', 'Backspace'] },
    { id: 'marker.add', keys: ['M'] },
    { id: 'track.addVideo', keys: [] },
  ];

  it('maps the default shortcuts of the registry', () => {
    const map = buildKeymap(commands);
    assert.equal(map.byCombo.get('S'), 'edit.split');
    assert.equal(map.byCombo.get('Ctrl+Z'), 'edit.undo');
    assert.equal(map.byCombo.get('Backspace'), 'edit.delete');
    assert.deepEqual(keymapToObject(map)['edit.delete'], ['Delete', 'Backspace']);
    assert.deepEqual(keymapToObject(map)['track.addVideo'], []);
    assert.equal(buildKeymap(commands, {}, true).byCombo.get('Meta+Z'), 'edit.undo');
  });

  it('replaces, adds and removes bindings from overrides', () => {
    const map = buildKeymap(commands, {
      'edit.split': 'C',
      'marker.add': '',
      'track.addVideo': ['Shift+V', 'Ctrl+T'],
      'Ctrl+B': 'edit.split',
      nonsense: 42,
    });
    assert.equal(map.byCombo.get('C'), 'edit.split');
    assert.equal(map.byCombo.has('S'), false, 'the default is gone');
    assert.equal(map.byCombo.has('M'), false, 'unbound');
    assert.equal(map.byCombo.get('Shift+V'), 'track.addVideo');
    assert.equal(map.byCombo.get('Ctrl+B'), 'edit.split');
    assert.deepEqual(map.byCommand.get('edit.split'), ['C', 'Ctrl+B']);
  });

  it('lets a user binding take a key from a default', () => {
    const map = buildKeymap(commands, { 'marker.add': 'S' });
    assert.equal(map.byCombo.get('S'), 'marker.add');
    assert.deepEqual(map.byCommand.get('edit.split'), []);
  });

  it('tolerates a malformed stored keymap', () => {
    assert.deepEqual(parseOverrides(null), {});
    assert.deepEqual(parseOverrides('{"edit.split":"C"}'), { 'edit.split': 'C' });
    assert.deepEqual(parseOverrides('[1,2]'), {});
    const warn = console.warn;
    console.warn = () => {};
    assert.deepEqual(parseOverrides('{not json'), {});
    console.warn = warn;
  });
});

describe('focus rules', () => {
  const el = (tagName, extra = {}) => ({ tagName, closest: () => null, ...extra });

  it('leaves every key to text fields', () => {
    for (const combo of ['S', 'Space', 'Delete', 'Ctrl+Z', 'ArrowLeft']) {
      assert.equal(controlOwnsKey(el('INPUT', { type: 'text' }), combo), true);
      assert.equal(controlOwnsKey(el('TEXTAREA'), combo), true);
      assert.equal(controlOwnsKey(el('DIV', { isContentEditable: true }), combo), true);
      assert.equal(controlOwnsKey(el('SELECT'), combo), true);
    }
  });

  it('leaves only their own keys to buttons, sliders and checkboxes', () => {
    assert.equal(controlOwnsKey(el('BUTTON'), 'Space'), true);
    assert.equal(controlOwnsKey(el('BUTTON'), 'Enter'), true);
    assert.equal(controlOwnsKey(el('BUTTON'), 'S'), false);
    assert.equal(controlOwnsKey(el('INPUT', { type: 'range' }), 'ArrowLeft'), true);
    assert.equal(controlOwnsKey(el('INPUT', { type: 'range' }), 'Space'), false);
    assert.equal(controlOwnsKey(el('INPUT', { type: 'checkbox' }), 'Space'), true);
    assert.equal(controlOwnsKey(el('INPUT', { type: 'checkbox' }), 'Delete'), false);
    assert.equal(controlOwnsKey(el('A', { hasAttribute: () => true }), 'Enter'), true);
    assert.equal(controlOwnsKey(el('DIV'), 'Space'), false);
    assert.equal(controlOwnsKey(null, 'S'), false);
  });

  it('leaves every key to menus and dialogs', () => {
    const inMenu = el('BUTTON', { closest: () => ({}) });
    assert.equal(controlOwnsKey(inMenu, 'S'), true);
    assert.equal(controlOwnsKey(inMenu, 'ArrowDown'), true);
  });

  it('gives copy and cut to the browser only while text is selected', () => {
    const real = globalThis.getSelection;
    globalThis.getSelection = () => ({ isCollapsed: false, toString: () => 'some words' });
    assert.equal(browserOwnsClipboardKey('Ctrl+C', false), true);
    assert.equal(browserOwnsClipboardKey('Meta+X', true), true);
    assert.equal(browserOwnsClipboardKey('Ctrl+V', false), false);
    globalThis.getSelection = () => ({ isCollapsed: true, toString: () => '' });
    assert.equal(browserOwnsClipboardKey('Ctrl+C', false), false);
    globalThis.getSelection = real;
  });

  it('knows when a modal dialog is open', () => {
    assert.equal(modalIsOpen(), false, 'no document: nothing is open');
    globalThis.document = {
      querySelector: (selector) => (selector.includes('dialog') ? {} : null),
    };
    assert.equal(modalIsOpen(), true);
    delete globalThis.document;
  });

  it('hands the focus back after a pointer click, not after a keyboard one', () => {
    let blurred = 0;
    const currentTarget = { blur: () => blurred++ };
    releasePointerFocus({ detail: 1, currentTarget });
    releasePointerFocus({ detail: 0, currentTarget });
    assert.equal(blurred, 1);
  });
});

describe('pan key', () => {
  it('runs its command on release while stopped, at once while playing', () => {
    let runs = 0;
    panKeyDown(() => runs++, false);
    assert.equal(isPanKeyHeld(), true);
    assert.equal(runs, 0, 'stopped: wait for the release');
    panKeyUp();
    assert.equal(runs, 1);
    assert.equal(isPanKeyHeld(), false);
    panKeyDown(() => runs++, true);
    assert.equal(runs, 2, 'playing: stop immediately');
    panKeyUp();
    assert.equal(runs, 2);
  });

  it('does not run the command when a pan drag used the hold', () => {
    let runs = 0;
    panKeyDown(() => runs++, false);
    consumePanKey();
    panKeyUp();
    assert.equal(runs, 0);
  });

  it('ignores key repeat and forgets the key when the window loses focus', () => {
    let runs = 0;
    panKeyDown(() => runs++, true);
    panKeyDown(() => runs++, true);
    assert.equal(runs, 1);
    panKeyReset();
    assert.equal(isPanKeyHeld(), false);
    panKeyDown(() => runs++, false);
    panKeyReset();
    panKeyUp();
    assert.equal(runs, 1, 'a reset drops the pending command');
  });
});
