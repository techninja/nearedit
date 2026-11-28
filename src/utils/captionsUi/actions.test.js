import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { canRedo, canUndo, getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { clipOf } from '#utils/edl/testkit.js';
import {
  canCaptionSelection,
  selectionCaptions,
  selectionIsCaptioned,
  switchCaptions,
  toggleSelectionCaptions,
} from './actions.js';
import { CAPTION_COMMANDS } from './commands.js';
import { talkDoc } from './testkit.js';

async function setup(selection) {
  loadDoc(talkDoc());
  await store.set(ViewState, { selection });
}
const on = (id) => clipOf(getDoc(), id).captions?.on === true;

describe('captions for the selection', () => {
  beforeEach(() => setup([]));

  it('has nothing to do without a clip that can speak', async () => {
    assert.equal(canCaptionSelection(), false);
    assert.equal(toggleSelectionCaptions(), false);
    assert.equal(canUndo(), false);
  });

  it('takes a linked pair as one voice and writes on its sound clip', async () => {
    await setup(['v', 'a']);
    assert.deepEqual(selectionCaptions(), { ids: ['a'], on: false });
    assert.equal(toggleSelectionCaptions(), true);
    assert.equal(on('a'), true);
    assert.equal('captions' in clipOf(getDoc(), 'v'), false);
    assert.equal(selectionIsCaptioned(), true);
    assert.equal(toggleSelectionCaptions(), true);
    assert.equal(on('a'), false);
    undo();
    undo();
    assert.equal(canUndo(), false, 'each toggle was one step');
    assert.equal(canRedo(), true);
  });

  it('switches the rest on when only some of the selection has captions', async () => {
    await setup(['v', 'memo', 'bed']);
    switchCaptions(['memo'], true);
    assert.equal(selectionIsCaptioned(), false);
    toggleSelectionCaptions();
    assert.deepEqual([on('a'), on('memo'), on('bed')], [true, true, true]);
    toggleSelectionCaptions();
    assert.deepEqual([on('a'), on('memo'), on('bed')], [false, false, false]);
  });

  it('is in the command table, with a shortcut for the selection', async () => {
    const [toggle, all, style] = CAPTION_COMMANDS;
    assert.deepEqual(
      [toggle.id, toggle.keys, toggle.group, all.id, all.keys, style.id],
      ['captions.toggle', ['Alt+C'], 'Edit', 'captions.all', ['Alt+Shift+C'], 'captions.style'],
    );
    assert.equal(toggle.enabled(), false);
    await setup(['v']);
    assert.equal(toggle.enabled(), true);
    assert.equal(toggle.pressed(), false);
    toggle.run();
    assert.equal(toggle.pressed(), true);
  });
});
