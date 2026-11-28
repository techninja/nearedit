import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { createEdl, createClip } from '#utils/edl/factory.js';
import { moveClips, deleteClips } from '#utils/edl/index.js';
import { clipOf, deepFreeze, testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { setSelection, getSelection, selectClip } from '#utils/editor/view.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Long enough for the frame a gesture preview waits for (16 ms without a browser). */
const frame = () => new Promise((resolve) => setTimeout(resolve, 40));
/** Lets a store write that has been made land, without letting any timer fire. */
const microtasks = async () => {
  for (let turn = 0; turn < 20; turn++) await null;
};
/** What the store holds about the document. */
const signal = () => ({ ...store.get(TimelineState) });

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

  it('gives the store a summary of the document, never the document', async () => {
    await tick();
    const { revision, ...summary } = signal();
    const loaded = { fps: 30, resolution: '1920x1080', duration: 4, trackCount: 2, clipCount: 2 };
    assert.deepEqual(summary, loaded);
    assert.equal(Number.isInteger(revision) && revision > 0, true);
    session.edit((doc) => ({ ...moveClips(doc, ['v'], { delta: 2 }), fps: 25 }));
    await tick();
    assert.deepEqual(signal(), { ...loaded, revision: revision + 1, fps: 25, duration: 6 });
  });

  it('raises the revision on every change: load, edit, undo, redo, cancel', async () => {
    await tick();
    let { revision } = signal();
    const steps = [
      () => session.edit((doc) => moveClips(doc, ['v'], { delta: 1 })),
      () => session.undo(),
      () => session.redo(),
      () => session.loadDoc(sampleDoc()),
      () => {
        session.commit(moveClips(session.beginGesture(), ['v'], { delta: 2 }));
        session.cancelGesture();
      },
    ];
    for (const step of steps) {
      step();
      await tick();
      assert.equal(signal().revision, ++revision, String(step));
    }
    assert.equal(
      session.edit((doc) => doc),
      false,
    );
    assert.equal(session.undo(), false, 'nothing to undo after a load');
    await tick();
    assert.equal(signal().revision, revision, 'no change, no signal');
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

  it('signals gesture previews once per frame, not per move, and the end at once', async () => {
    await tick();
    const { revision } = signal();
    const base = session.beginGesture();
    for (const delta of [1, 2, 3]) session.commit(moveClips(base, ['v'], { delta }));
    assert.equal(session.getDoc().tracks[0].clips[0].timelineStart, 3, 'the session has the move');
    await microtasks();
    assert.equal(signal().revision, revision, 'previews wait for the frame');
    assert.equal(signal().duration, 4);
    await frame();
    assert.equal(signal().revision, revision + 1, 'three moves, one signal');
    assert.equal(signal().duration, 7);
    for (const delta of [4, 5]) session.commit(moveClips(base, ['v'], { delta }));
    session.endGesture();
    await tick();
    assert.equal(signal().revision, revision + 2, 'the end does not wait for a frame');
    assert.equal(signal().duration, 9);
    await frame();
    assert.equal(signal().revision, revision + 2, 'the queued preview was not written again');
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

describe('edit session: data no store model declares', () => {
  const effects = [{ effectId: 'fx_1', type: 'blur', enabled: true, params: { radius: 8 } }];
  const stops = [
    { at: 0, color: '#1e1b4b' },
    { at: 1, color: '#f97316' },
  ];
  const generator = { type: 'gradient', seed: 7, params: { angle: 90, stops } };
  const keyframes = {
    'transform.x': [
      { t: 0, v: 0 },
      { t: 1.2, v: -400, ease: 'ease-out' },
    ],
    'effects.fx_1.radius': [{ t: 0, v: 30 }],
  };
  const extras = { effects, generator, keyframes, blendMode: 'screen' };

  /** @returns {any} A frozen document whose clip, track and root carry undeclared data */
  function richDoc() {
    const doc = testEdl(
      { v1: [testClip('fx', 0, 4, extras), testClip('plain', 10, 12)] },
      { background: '#101010' },
    );
    Object.assign(doc.tracks[0], { opacity: 0.5, effects: [{ type: 'vignette', params: {} }] });
    return deepFreeze(doc);
  }

  /** Every undeclared field of the current document, wherever the clip now sits. */
  const carried = () => {
    const doc = session.getDoc();
    const { effects, generator, keyframes, blendMode } = clipOf(doc, 'fx');
    const [{ opacity, effects: trackEffects }] = doc.tracks;
    return { effects, generator, keyframes, blendMode, opacity, trackEffects, bg: doc.background };
  };

  it('keeps it through load, edit, a gesture, undo and redo', async () => {
    await tick();
    let { revision } = signal();
    const doc = richDoc();
    const expected = {
      ...structuredClone(extras),
      opacity: 0.5,
      trackEffects: [{ type: 'vignette', params: {} }],
      bg: '#101010',
    };
    const check = async (label, start) => {
      await tick();
      assert.deepEqual(carried(), expected, label);
      assert.equal(clipOf(session.getDoc(), 'fx').timelineStart, start, label);
      assert.equal(signal().revision, ++revision, `${label}: one signal`);
    };

    session.loadDoc(doc);
    assert.equal(session.getDoc(), doc, 'the session holds the document itself, not a copy');
    await check('load', 0);
    session.edit((current) => moveClips(current, ['fx'], { delta: 1 }));
    await check('edit', 1);
    const base = session.beginGesture();
    for (const delta of [0.5, 1, 1.5]) session.commit(moveClips(base, ['fx'], { delta }));
    session.endGesture();
    await check('gesture', 2.5);
    session.undo();
    await check('undo the gesture', 1);
    session.undo();
    await check('undo the edit', 0);
    assert.equal(session.getDoc(), doc, 'undo returns the loaded document');
    session.redo();
    await check('redo', 1);
    session.redo();
    await check('redo the gesture', 2.5);
    assert.deepEqual(
      signal(),
      { revision, fps: 30, resolution: '1920x1080', duration: 12, trackCount: 2, clipCount: 2 },
      'the store still holds the summary and nothing of the document',
    );
  });
});

describe('edit session: amending outside history', () => {
  const start = () => clipOf(session.getDoc(), 'v').timelineStart;
  const move = (doc) => moveClips(doc, ['v'], { delta: 1 });
  /** What a finished rendering does: a fact about the document, not an edit. */
  const amend = (rendered) => session.commit({ ...session.getDoc(), rendered }, { record: false });
  const now = () => [start(), session.getDoc().rendered];
  beforeEach(() => session.loadDoc(sampleDoc()));

  it('replaces the document without an undo step and tells listeners why', () => {
    const seen = [];
    const stop = session.onDocChange((_doc, info) => seen.push(info));
    assert.equal(amend('a'), true);
    stop();
    assert.deepEqual(now(), [0, 'a']);
    assert.equal(session.canUndo(), false, 'nothing to undo: it was not an edit');
    assert.deepEqual(seen, [{ transient: false, reason: 'amend' }]);
    assert.equal(session.commit(session.getDoc(), { record: false }), false);
  });

  it('keeps redo, and undo and redo walk through the edits only', () => {
    session.edit(move);
    session.edit(move);
    session.undo();
    amend('b');
    assert.deepEqual(now(), [1, 'b']);
    assert.equal(session.canRedo(), true, 'an amendment does not clear redo');
    session.redo();
    assert.deepEqual(now(), [2, undefined], 'redo is the document the second edit made');
    session.undo();
    assert.deepEqual(now(), [1, 'b'], 'undo returns to the amended document');
    session.undo();
    assert.deepEqual(now(), [0, undefined]);
    assert.equal(session.canUndo(), false);
  });

  it('is part of a gesture when one is under way', () => {
    session.beginGesture();
    amend('c');
    session.cancelGesture();
    assert.deepEqual(now(), [0, undefined], 'a cancelled gesture takes it along: wait for idle');
  });
});
