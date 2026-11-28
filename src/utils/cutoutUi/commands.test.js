import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import AppState from '#store/AppState.js';
import ViewState from '#store/ViewState.js';
import { COMMANDS, getCommand, isEnabled, isPressed, runCommand } from '#utils/commands/index.js';
import { attachCutout, toggleTrackLock } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { buildKeymap } from '#utils/keyboard/keymap.js';
import { presetCommands } from '#utils/keyboard/presets.js';
import { CUTOUT_COMMANDS } from './commands.js';
import { SELFIE, cutoutDoc, madeFor } from './testkit.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const select = (/** @type {string[]} */ ids) => store.set(ViewState, { selection: ids });
const cutout = (/** @type {string} */ id) => clipOf(session.getDoc(), id).cutout;
const browser = { requestAnimationFrame: globalThis.requestAnimationFrame };

// The command shows the inspector: in a browser that waits two frames.
before(() => {
  globalThis.requestAnimationFrame = (run) => /** @type {any} */ (setTimeout(run, 0));
  Object.assign(globalThis, { document: { querySelector: () => null } });
});
after(async () => {
  for (let frame = 0; frame < 3; frame++) await tick(); // let the last frames run
  globalThis.requestAnimationFrame = browser.requestAnimationFrame;
  delete (/** @type {any} */ (globalThis).document);
});
beforeEach(async () => {
  session.loadDoc(cutoutDoc());
  await select([]);
});

describe('the cutout commands', () => {
  it('are in the registry, with a key in both layouts', () => {
    assert.deepEqual(
      CUTOUT_COMMANDS.map((command) => [command.id, command.label, command.group]),
      [
        ['cutout.toggle', 'Cut out person', 'Edit'],
        ['cutout.makeAll', 'Make all missing cutouts', 'Edit'],
      ],
    );
    for (const command of CUTOUT_COMMANDS) assert.equal(getCommand(command.id), command);
    assert.equal(buildKeymap(COMMANDS).byCombo.get('Alt+P'), 'cutout.toggle');
    const vegas = buildKeymap(presetCommands(COMMANDS, 'vegas'));
    assert.equal(vegas.byCombo.get('Alt+P'), 'cutout.toggle');
  });

  it('cuts the person out of the selected footage, as one undo step, and shows the inspector', async () => {
    assert.equal(isEnabled('cutout.toggle'), false, 'nothing selected');
    await select(['photo', 'sound']);
    assert.equal(isEnabled('cutout.toggle'), false, 'a still and sound cannot be cut out');
    await select(['me', 'me2', 'photo']);
    assert.equal(isEnabled('cutout.toggle'), true);
    assert.equal(isPressed('cutout.toggle'), false);
    await store.set(AppState, { dockTab: 'media' });
    assert.equal(runCommand('cutout.toggle'), true);
    await tick();
    assert.deepEqual([cutout('me').on, cutout('me2').on, cutout('photo')], [true, true, undefined]);
    assert.equal(isPressed('cutout.toggle'), true);
    assert.equal(store.get(AppState).dockTab, 'inspector');
    session.undo();
    assert.equal(cutout('me'), undefined, 'one step for both clips');
    assert.equal(session.canUndo(), false);
  });

  it('switches it off again when every selected clip is cut out', async () => {
    await select(['me', 'me2']);
    runCommand('cutout.toggle');
    session.edit((doc) => attachCutout(doc, madeFor({ path: SELFIE, start: 3, end: 24, fps: 30 })));
    runCommand('cutout.toggle');
    assert.equal(cutout('me').on, false);
    assert.ok(cutout('me').made, 'what was made is kept for the next time');
    assert.equal(isPressed('cutout.toggle'), false);
  });

  it('leaves clips on a locked track alone', async () => {
    session.edit((doc) => toggleTrackLock(doc, 'v1'));
    await select(['me']);
    assert.equal(isEnabled('cutout.toggle'), false);
  });

  it('offers to make what is missing only while something is', async () => {
    assert.equal(isEnabled('cutout.makeAll'), false);
    await select(['me']);
    runCommand('cutout.toggle');
    assert.equal(isEnabled('cutout.makeAll'), true);
    session.edit((doc) => attachCutout(doc, madeFor({ path: SELFIE, start: 3, end: 10, fps: 30 })));
    assert.equal(isEnabled('cutout.makeAll'), false);
  });
});
