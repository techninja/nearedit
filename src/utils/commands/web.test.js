import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { testClip } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { contextMenu } from '#utils/timeline/menuModel.js';
import { webMenu } from '#utils/timeline/menuWeb.js';
import { closeWebEditor, webEditorState } from '#utils/webUi/editorState.js';
import { recordingState } from '#utils/webUi/recording.js';
import { webDoc } from '#utils/webUi/testkit.js';
import { getCommand, isEnabled, runCommand } from './registry.js';
import { selectClipSpan } from './timeSelection.js';

let clipId = '';
const select = (ids) => store.set(ViewState, { selection: ids, loopStart: 0, loopEnd: 0 });

describe('web clip commands', () => {
  beforeEach(async () => {
    const made = webDoc([{ do: 'wait' }]);
    made.doc.tracks[1].clips.push(testClip('sound', 0, 2));
    clipId = made.clipId;
    session.loadDoc(made.doc);
    recordingState.set({ byClip: {} });
    await select([]);
  });
  afterEach(closeWebEditor);

  it('are in the registry with a key each in both presets', () => {
    assert.deepEqual(getCommand('web.editSteps').keys, ['Alt+W']);
    assert.deepEqual(getCommand('web.record').keys, ['Alt+R']);
    assert.deepEqual(getCommand('web.recordAll').keys, []);
    assert.equal(getCommand('web.editSteps').group, 'Edit');
  });

  it('need a selected web clip', async () => {
    assert.equal(isEnabled('web.editSteps'), false);
    assert.equal(runCommand('web.editSteps'), false);
    await select(['sound']);
    assert.equal(isEnabled('web.record'), false);
    await select([clipId]);
    assert.equal(isEnabled('web.editSteps'), true);
    assert.equal(isEnabled('web.record'), true);
    assert.equal(isEnabled('web.recordAll'), true);
  });

  it('open the web editor on the selected web clip', async () => {
    await select(['sound', clipId]);
    assert.equal(runCommand('web.editSteps'), true);
    assert.equal(webEditorState.get().clipId, clipId);
  });

  it('open the web editor on a double-clicked web clip, and still loop any other clip', async () => {
    selectClipSpan(clipId);
    assert.equal(webEditorState.get().clipId, clipId);
    assert.equal(getView().loopEnd, 0);
    closeWebEditor();
    selectClipSpan('sound');
    await null;
    assert.equal(webEditorState.get().clipId, '');
    assert.deepEqual([getView().loopStart, getView().loopEnd], [0, 2]);
  });
});

describe('web clip context menu', () => {
  beforeEach(() => {
    const made = webDoc([{ do: 'wait' }]);
    made.doc.tracks[1].clips.push(testClip('sound', 0, 2));
    clipId = made.clipId;
    session.loadDoc(made.doc);
    recordingState.set({ byClip: {} });
  });
  afterEach(closeWebEditor);

  it('offers to edit the steps and to record, first, on a web clip only', () => {
    const doc = session.getDoc();
    const items = webMenu(doc, { clipId });
    assert.deepEqual(
      items.map((item) => item.label || '-'),
      ['Edit steps…', 'Record', '-'],
    );
    assert.deepEqual(webMenu(doc, { clipId: 'sound' }), []);
    assert.deepEqual(webMenu(doc, {}), []);
    const ui = { renameMarker() {}, renameRegion() {} };
    const hit = { zone: 'lane', time: 1, trackId: doc.tracks[0].trackId, clipId, part: 'body' };
    const menu = contextMenu(/** @type {any} */ (hit), ui);
    assert.deepEqual(
      menu.slice(0, 2).map((item) => item.label),
      ['Edit steps…', 'Record'],
    );
    const other = contextMenu(/** @type {any} */ ({ ...hit, clipId: 'sound' }), ui);
    assert.ok(!other.some((item) => item.label === 'Edit steps…'));
    menu[0].run();
    assert.equal(webEditorState.get().clipId, clipId);
  });

  it('offers to cancel while the clip is being recorded', () => {
    recordingState.set({ byClip: { [clipId]: { status: 'running', progress: 10, message: '' } } });
    const [, record] = webMenu(session.getDoc(), { clipId });
    assert.equal(record.label, 'Cancel recording');
  });
});
