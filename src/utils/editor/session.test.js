import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { createEdl, createClip } from '#utils/edl/factory.js';
import { moveClips, deleteClips } from '#utils/edl/index.js';
import * as session from '#utils/editor/session.js';
import { setSelection, getSelection, selectClip } from '#utils/editor/view.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** @returns {any} */
function sampleDoc() {
  const edl = createEdl();
  const media = { sourceFile: '/m/a.mp4', sourceOut: 4, timelineEnd: 4 };
  edl.tracks[0].clips.push(createClip({ ...media, clipId: 'v', linkedClipId: 'a' }));
  edl.tracks[1].clips.push(createClip({ ...media, clipId: 'a', linkedClipId: 'v' }));
  return edl;
}

describe('edit session', () => {
  beforeEach(async () => {
    session.loadDoc(sampleDoc());
    await store.set(ViewState, { selection: [] });
  });

  it('mirrors the document into TimelineState', async () => {
    await tick();
    assert.equal(store.get(TimelineState).tracks[0].clips[0].clipId, 'v');
  });

  it('commits an edit as one undoable step and can redo it', () => {
    const before = session.getDoc();
    assert.equal(session.canUndo(), false);
    assert.equal(
      session.edit((doc) => moveClips(doc, ['v'], { delta: 2 })),
      true,
    );
    assert.equal(session.getDoc().tracks[0].clips[0].timelineStart, 2);
    assert.equal(session.getDoc().tracks[1].clips[0].timelineStart, 2, 'linked partner follows');
    assert.equal(session.undo(), true);
    assert.equal(session.getDoc(), before, 'undo restores the same reference');
    assert.equal(session.redo(), true);
    assert.equal(session.getDoc().tracks[0].clips[0].timelineStart, 2);
  });

  it('ignores a no-op edit', () => {
    assert.equal(
      session.edit((doc) => doc),
      false,
    );
    assert.equal(session.canUndo(), false);
  });

  it('collapses a whole gesture into one undo step', () => {
    const base = session.beginGesture();
    const infos = [];
    const stop = session.onDocChange((_doc, info) => infos.push(info));
    for (const delta of [0.5, 1, 1.5]) session.commit(moveClips(base, ['v'], { delta }));
    assert.equal(session.canUndo(), false, 'previews are not history');
    assert.equal(session.endGesture(), true);
    stop();
    assert.deepEqual(
      infos.map((i) => i.transient),
      [true, true, true, false],
    );
    assert.equal(session.getDoc().tracks[0].clips[0].timelineStart, 1.5);
    session.undo();
    assert.equal(session.getDoc(), base);
    assert.equal(session.canUndo(), false);
  });

  it('restores the starting document when a gesture is cancelled', () => {
    const base = session.beginGesture();
    session.commit(moveClips(base, ['v'], { delta: 3 }));
    session.cancelGesture();
    assert.equal(session.getDoc(), base);
    assert.equal(session.canUndo(), false);
  });

  it('drops deleted clips from the selection', async () => {
    setSelection(['v']);
    await tick();
    assert.deepEqual(getSelection().sort(), ['a', 'v'], 'selection expands to the linked clip');
    session.edit((doc) => deleteClips(doc, ['v']));
    await tick();
    assert.deepEqual(getSelection(), []);
  });

  it('toggles a clip and its partner in and out of the selection', async () => {
    selectClip('v', { toggle: true });
    await tick();
    assert.deepEqual(getSelection().sort(), ['a', 'v']);
    selectClip('a', { toggle: true });
    await tick();
    assert.deepEqual(getSelection(), []);
  });

  it('clears history when a new document is loaded', () => {
    session.edit((doc) => moveClips(doc, ['v'], { delta: 1 }));
    session.loadDoc(sampleDoc());
    assert.equal(session.canUndo(), false);
  });
});
