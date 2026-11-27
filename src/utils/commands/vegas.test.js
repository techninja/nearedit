import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import UserPrefs from '#store/UserPrefs.js';
import ViewState from '#store/ViewState.js';
import { addMarker } from '#utils/edl/index.js';
import { addRegion, regionsOf } from '#utils/edl/regions.js';
import { assertValid, clipOf, layout, testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { getEdgeTrim, setEdgeTrim } from '#utils/timeline/edgeTrim.js';
import * as commands from './index.js';
import { isEnabled, runCommand } from './registry.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
// The transport parks audio on a window timer after a seek; there is no audio here.
globalThis.window = /** @type {any} */ ({ setTimeout: () => 0 });
const F = 1 / 30;

function sample() {
  let doc = testEdl({
    v2: [testClip('t', 1, 6)],
    v1: [testClip('a', 0, 4, { linkedClipId: 'as' }), testClip('b', 6, 10), testClip('c', 12, 14)],
    a1: [testClip('as', 0, 4, { linkedClipId: 'a' }), testClip('n', 12, 20)],
  });
  doc = addMarker(addMarker(doc, 5, { markerId: 'm5' }), 13, { markerId: 'm13' });
  return addRegion(doc, 11, 15, { regionId: 'r', label: 'R' });
}
async function setup(view = {}, prefs = {}) {
  session.loadDoc(sample());
  setEdgeTrim(null);
  await store.set(UserPrefs, { rippleScope: 'track', snapMarkers: true, ...prefs });
  await store.set(ViewState, {
    cursorPosition: 0,
    playheadPosition: 0,
    selection: [],
    zoom: 1,
    snapping: false,
    ripple: false,
    autoCrossfade: true,
    activeTrackId: '',
    loopStart: 0,
    loopEnd: 0,
    ...view,
  });
}
const doc = () => assertValid(session.getDoc());
const loop = async () => (await tick(), [getView().loopStart, getView().loopEnd]);

describe('time selection commands', () => {
  beforeEach(() => setup());

  it('marks in and out at the cursor', async () => {
    await setup({ cursorPosition: 2 });
    commands.markIn();
    assert.deepEqual(await loop(), [2, 2], 'the in point waits for an out point');
    await setup({ cursorPosition: 7, loopStart: 2, loopEnd: 2 });
    commands.markOut();
    assert.deepEqual(await loop(), [2, 7]);
    await setup({ cursorPosition: 4, loopStart: 2, loopEnd: 7 });
    commands.markIn();
    assert.deepEqual(await loop(), [4, 7], 'a later end is kept');
  });

  it('extends to event edges, recalls, and selects spans', async () => {
    await setup({ cursorPosition: 7, playheadPosition: 7, loopStart: 2, loopEnd: 7 });
    assert.equal(commands.extendToEdit(1), true);
    assert.deepEqual(await loop(), [2, 10]);
    assert.equal(getView().cursorPosition, 10);
    commands.selectClipSpan('c');
    assert.deepEqual(await loop(), [12, 14]);
    assert.equal(commands.recallSelection(), true);
    assert.deepEqual(await loop(), [2, 10]);
    commands.selectBetweenMarkers(8);
    assert.deepEqual(await loop(), [5, 11], 'region ends count as markers');
    commands.clearTimeSelection();
    assert.deepEqual(await loop(), [0, 0]);
    assert.equal(isEnabled('edit.trimToSelection'), false);
  });

  it('trims to the time selection: the selected clips, or all of them', async () => {
    await setup({ loopStart: 2, loopEnd: 8, selection: ['a', 'as', 'b'] });
    assert.equal(runCommand('edit.trimToSelection'), true);
    assert.deepEqual(layout(doc()), {
      v2: ['t 1-6'],
      v1: ['a 2-4', 'b 6-8', 'c 12-14'],
      a1: ['as 2-4', 'n 12-20'],
    });
    session.undo();
    await store.set(ViewState, { selection: [] });
    runCommand('edit.trimToSelection');
    assert.deepEqual(layout(doc()), { v2: ['t 2-6'], v1: ['a 2-4', 'b 6-8'], a1: ['as 2-4'] });
    assert.equal(session.canUndo(), true);
  });
});

describe('ripple commands', () => {
  beforeEach(() => setup());
  const marks = () => [
    doc().markers.map((m) => m.time),
    regionsOf(doc()).map((r) => [r.start, r.end]),
  ];

  it('offers F after a plain edit, once, for each scope', async () => {
    assert.equal(commands.canPostRipple(), false);
    await setup({ selection: ['b'] });
    commands.deleteSelection();
    assert.equal(commands.canPostRipple(), true);
    assert.deepEqual(commands.pendingRipple(), [{ from: 10, by: -4 }]);
    assert.equal(runCommand('ripple.postTracks'), true);
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 8-10']);
    assert.deepEqual(layout(doc()).a1, ['as 0-4', 'n 12-20'], 'other tracks stay');
    assert.deepEqual(marks(), [[5, 13], [[11, 15]]]);
    assert.equal(commands.canPostRipple(), false, 'a ripple is not rippled again');
    session.undo();
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 12-14'], 'undo leaves the delete');
    assert.equal(commands.canPostRipple(), false, 'nor is an undone edit');
  });

  it('carries markers and regions (Ctrl+F) and every track (Ctrl+Shift+F)', async () => {
    await setup({ selection: ['b'] });
    commands.deleteSelection();
    commands.postEditRipple('marks');
    assert.deepEqual(layout(doc()).a1, ['as 0-4', 'n 12-20']);
    assert.deepEqual(marks(), [[5, 9], [[7, 11]]]);
    await setup({ selection: ['b'] });
    commands.deleteSelection();
    commands.postEditRipple('all');
    assert.deepEqual(layout(doc()).a1, ['as 0-4', 'n 8-16']);
    assert.deepEqual(marks(), [[5, 9], [[7, 11]]]);
  });

  it('ripples at once with auto ripple on, by the chosen scope, leaving nothing for F', async () => {
    await setup({ selection: ['b'], ripple: true }, { rippleScope: 'marks' });
    commands.deleteSelection();
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 8-10']);
    assert.deepEqual(marks(), [[5, 9], [[7, 11]]]);
    assert.equal(commands.canPostRipple(), false);
    session.undo();
    assert.deepEqual(layout(doc()).v1.length, 3, 'edit and ripple are one undo step');
    await setup({ selection: ['b'] }, { rippleScope: 'all' });
    commands.rippleDeleteSelection();
    assert.deepEqual(layout(doc()).a1, ['as 0-4', 'n 8-16'], 'ripple delete honours the scope too');
    assert.equal(commands.canPostRipple(), false);
  });

  it('pastes insert without leaving a ripple, and repeats a paste', async () => {
    await setup({ selection: ['c'], cursorPosition: 7 });
    commands.copySelection();
    assert.equal(commands.pasteInsertAtCursor(), true);
    assert.deepEqual(
      layout(doc()).v1.map((entry) => entry.split(' ')[1]),
      ['0-4', '6-7', '7-9', '9-12', '14-16'],
    );
    assert.deepEqual(marks(), [[5, 15], [[13, 17]]]);
    assert.equal(commands.canPostRipple(), false);
    await tick();
    assert.equal(getSelection().length, 1, 'only the pasted clip is selected');
    assert.equal(clipOf(doc(), getSelection()[0]).timelineStart, 7);
    await setup({ selection: ['c'], cursorPosition: 30 });
    commands.copySelection();
    commands.pasteRepeatAtCursor({ count: 3, every: 4 });
    assert.deepEqual(
      layout(doc())
        .v1.slice(3)
        .map((entry) => entry.split(' ')[1]),
      ['30-32', '34-36', '38-40'],
    );
  });
});

describe('event keys', () => {
  it('chooses an edge, walks along the track, trims it and leaves', async () => {
    await setup({ selection: ['b'] });
    assert.equal(commands.selectEdge('end'), true);
    assert.deepEqual(getEdgeTrim(), { clipId: 'b', edge: 'end' });
    await tick();
    assert.equal(getView().cursorPosition, 10);
    assert.equal(commands.nudgeSelection(-3), true);
    assert.deepEqual(layout(doc()).v1[1], 'b 6-9.9', 'three frames off the end');
    commands.selectEdge('end');
    assert.deepEqual(getEdgeTrim(), { clipId: 'c', edge: 'start' });
    commands.selectEdge('start');
    commands.selectEdge('start');
    assert.deepEqual(getEdgeTrim(), { clipId: 'b', edge: 'start' });
    assert.equal(runCommand('trim.exit'), true);
    assert.equal(getEdgeTrim(), null);
    assert.equal(isEnabled('trim.exit'), false);
    commands.nudgeSelection(3);
    assert.deepEqual(layout(doc()).v1[1], 'b 6.1-10', 'out of the mode the keys nudge again');
  });

  it('moves the selection to the track above or below, and manages groups', async () => {
    await setup({ selection: ['b'] });
    assert.equal(commands.moveSelectionToTrack(-1), true);
    assert.deepEqual(layout(doc()).v2, ['t 1-6', 'b 6-10']);
    assert.equal(commands.moveSelectionToTrack(-1), false, 'no track above');
    await setup({ selection: ['a', 'as', 'b', 'c'] });
    commands.groupSelection();
    await store.set(ViewState, { selection: ['c'] });
    assert.equal(commands.removeFromGroup(), true);
    assert.equal(clipOf(doc(), 'c').groupId, '');
    assert.ok(
      clipOf(doc(), 'a').groupId && clipOf(doc(), 'a').groupId === clipOf(doc(), 'b').groupId,
    );
    await store.set(ViewState, { selection: ['b'] });
    assert.equal(commands.selectWholeGroups(), true);
    await tick();
    assert.deepEqual(getSelection().sort(), ['a', 'as', 'b']);
  });
});
