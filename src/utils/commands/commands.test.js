import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { assertValid, clipOf, layout, testClip, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import * as commands from './index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const F = 1 / 30;

/** Three clips on v1 (the first linked to its sound on a1) and a bed on a2. */
function sample() {
  return testEdl({
    v1: [testClip('a', 0, 4, { linkedClipId: 'as' }), testClip('b', 6, 10), testClip('c', 12, 14)],
    a1: [testClip('as', 0, 4, { linkedClipId: 'a' })],
    a2: [testClip('m', 0, 20)],
  });
}

async function setup(view = {}) {
  session.loadDoc(sample());
  await store.set(ViewState, {
    cursorPosition: 0,
    playheadPosition: 0,
    selection: [],
    snapping: true,
    ripple: false,
    autoCrossfade: true,
    activeTrackId: '',
    ...view,
  });
}
const doc = () => assertValid(session.getDoc());
const selection = async () => (await tick(), getSelection().sort());

describe('split, delete, nudge, trim', () => {
  beforeEach(() => setup());

  it('splits the selected clips under the cursor, linked partner included', async () => {
    await setup({ cursorPosition: 2, selection: ['a', 'as'] });
    assert.equal(commands.canSplit(), true);
    assert.equal(commands.splitAtCursor(), true);
    assert.deepEqual(
      layout(doc())
        .v1.slice(0, 2)
        .map((s) => s.split(' ')[1]),
      ['0-2', '2-4'],
    );
    assert.equal(doc().tracks[1].clips.length, 2, 'linked audio is split too');
    assert.equal(doc().tracks[2].clips.length, 1, 'the bed is not selected: left whole');
    assert.equal(session.canUndo(), true);
    session.undo();
    assert.equal(doc().tracks[0].clips.length, 3, 'one undo step');
  });

  it('splits everything under the cursor when nothing selected is there', async () => {
    await setup({ cursorPosition: 7 });
    commands.splitAtCursor();
    assert.equal(doc().tracks[0].clips.length, 4);
    assert.equal(doc().tracks[2].clips.length, 2);
    await setup({ cursorPosition: 7, selection: ['c'] });
    commands.splitAtCursor();
    assert.equal(doc().tracks[0].clips.length, 4, 'a selection elsewhere does not block the cut');
  });

  it('has nothing to split on an edge or in a gap', async () => {
    await setup({ cursorPosition: 30 });
    assert.equal(commands.canSplit(), false);
    assert.equal(commands.splitAtCursor(), false);
    assert.equal(session.canUndo(), false);
  });

  it('deletes leaving a gap, or closing it in ripple mode', async () => {
    await setup({ selection: ['b'] });
    commands.deleteSelection();
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 12-14']);
    await setup({ selection: ['b'], ripple: true });
    commands.deleteSelection();
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 8-10']);
    await setup({ selection: ['b'] });
    commands.rippleDeleteSelection();
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'c 8-10'], 'ripple delete always closes');
    assert.deepEqual(layout(doc()).a2, ['m 0-20'], 'other tracks stay');
    await setup();
    assert.equal(commands.deleteSelection(), false, 'nothing selected');
  });

  it('nudges by frames, following ripple mode', async () => {
    await setup({ selection: ['b'] });
    commands.nudgeSelection(1);
    assert.ok(Math.abs(clipOf(doc(), 'b').timelineStart - (6 + F)) < 1e-9);
    commands.nudgeSelection(-11);
    assert.ok(Math.abs(clipOf(doc(), 'b').timelineStart - (6 - 10 * F)) < 1e-9);
    await setup({ selection: ['b'], ripple: true });
    commands.nudgeSelection(30);
    assert.deepEqual(layout(doc()).v1, ['a 0-4', 'b 7-11', 'c 13-15']);
  });

  it('trims the selection to the cursor', async () => {
    await setup({ selection: ['b'], cursorPosition: 7 });
    commands.trimStartToCursor();
    assert.deepEqual([clipOf(doc(), 'b').timelineStart, clipOf(doc(), 'b').sourceIn], [7, 1]);
    await store.set(ViewState, { cursorPosition: 9 });
    commands.trimEndToCursor();
    assert.equal(clipOf(doc(), 'b').timelineEnd, 9);
  });
});

describe('clipboard', () => {
  it('copies and pastes at the cursor, selecting the copies', async () => {
    await setup({ selection: ['a', 'as'], cursorPosition: 15 });
    assert.equal(commands.copySelection(), true);
    assert.equal(commands.hasClipboard(), true);
    assert.equal(commands.paste(), true);
    const pasted = doc().tracks[0].clips.find((clip) => clip.timelineStart === 15);
    assert.ok(pasted && pasted.clipId !== 'a' && pasted.timelineEnd === 19);
    const partner = doc().tracks[1].clips.find((clip) => clip.timelineStart === 15);
    assert.equal(pasted.linkedClipId, partner.clipId, 'the link is kept inside the copy');
    assert.deepEqual(await selection(), [pasted.clipId, partner.clipId].sort());
    session.undo();
    assert.equal(doc().tracks[0].clips.length, 3, 'paste is one undo step');
  });

  it('cuts and duplicates', async () => {
    await setup({ selection: ['c'] });
    commands.cutSelection();
    assert.equal(clipOf(doc(), 'c'), undefined);
    assert.equal(commands.getClipboard().items.length, 1);
    await setup({ selection: ['b'] });
    commands.duplicateSelection();
    const copy = doc().tracks[0].clips.find((clip) => clip.timelineStart === 10);
    assert.ok(copy && copy.timelineEnd === 14 && copy.clipId !== 'b');
    assert.deepEqual(await selection(), [copy.clipId]);
  });

  it('tells listeners when there is something to paste', async () => {
    await setup({ selection: ['b'] });
    let told = 0;
    const stop = commands.onClipboardChange(() => told++);
    commands.copySelection();
    stop();
    commands.copySelection();
    assert.equal(told, 1);
  });
});

describe('selection, markers, titles, tracks', () => {
  it('groups, ungroups, links and unlinks', async () => {
    await setup({ selection: ['b', 'c'] });
    commands.groupSelection();
    assert.ok(
      clipOf(doc(), 'b').groupId && clipOf(doc(), 'b').groupId === clipOf(doc(), 'c').groupId,
    );
    commands.ungroupSelection();
    assert.equal(clipOf(doc(), 'b').groupId, '');
    await setup({ selection: ['a', 'as'] });
    commands.unlinkSelection();
    assert.equal(clipOf(doc(), 'a').linkedClipId, '');
    await setup({ selection: ['b', 'm'] });
    commands.linkSelection();
    assert.equal(clipOf(doc(), 'b').linkedClipId, 'm');
    commands.selectAllClips();
    assert.equal((await selection()).length, 5);
    commands.selectNone();
    assert.deepEqual(await selection(), []);
  });

  it('adds a marker and a title at the cursor', async () => {
    await setup({ cursorPosition: 5 });
    commands.addMarkerAtCursor('Chorus');
    assert.deepEqual(
      doc().markers.map((m) => [m.time, m.label]),
      [[5, 'Chorus']],
    );
    commands.deleteMarker(doc().markers[0].markerId);
    assert.equal(doc().markers.length, 0);
    commands.addTitleAtCursor();
    const title = doc().tracks[0].clips.find((clip) => clip.text.content === 'Title');
    assert.deepEqual([title.timelineStart, title.timelineEnd], [5, 10]);
    assert.deepEqual(await selection(), [title.clipId]);
  });

  it('adds and removes tracks, and places media', async () => {
    await setup({ cursorPosition: 16 });
    commands.addVideoTrack();
    commands.addAudioTrack();
    assert.deepEqual(
      doc().tracks.map((t) => t.type),
      ['video', 'video', 'audio', 'audio', 'audio'],
    );
    commands.removeTrackById(doc().tracks[0].trackId);
    assert.equal(doc().tracks.length, 4);
    const item = {
      filePath: '/media/new.mp4',
      filename: 'new.mp4',
      type: 'video',
      duration: 3,
      hasAudio: true,
    };
    assert.equal(commands.insertMediaItem(item), true);
    const placed = doc().tracks[0].clips.find((clip) => clip.sourceFile === '/media/new.mp4');
    assert.deepEqual([placed.timelineStart, placed.timelineEnd], [16, 19]);
    assert.ok(placed.linkedClipId, 'a video with sound brings its linked audio');
    assert.equal(commands.insertMediaItem({ filePath: '/x.md', type: 'text' }), false);
  });
});
