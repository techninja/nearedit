import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from './factory.js';
import {
  addTrack,
  moveTrack,
  nextTrackName,
  removeTrack,
  renameTrack,
  setTrackVolume,
  toggleTrackLock,
  toggleTrackMute,
  toggleTrackSolo,
  updateTrack,
} from './trackOps.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const names = (edl) => edl.tracks.map((track) => track.name);
const ids = (edl) => edl.tracks.map((track) => track.trackId);

describe('addTrack', () => {
  it('adds video tracks on top and audio tracks at the bottom, with automatic names', () => {
    let edl = deepFreeze(createEdl());
    edl = deepFreeze(addTrack(edl, 'video'));
    edl = deepFreeze(addTrack(edl, 'audio'));
    edl = assertValid(addTrack(edl, 'video'));
    assert.deepEqual(names(edl), ['Video 3', 'Video 2', 'Video 1', 'Audio 1', 'Audio 2']);
    assert.deepEqual(
      edl.tracks.map((t) => t.type),
      ['video', 'video', 'video', 'audio', 'audio'],
    );
    assert.equal(new Set(ids(edl)).size, 5);
  });

  it('accepts a name, an id and a position', () => {
    const edl = addTrack(createEdl(), 'video', {
      name: 'B-roll',
      trackId: 'broll',
      position: 'bottom',
    });
    assert.deepEqual(ids(edl), ['v1', 'broll', 'a1']);
    assert.equal(edl.tracks[1].name, 'B-roll');
    const top = addTrack(edl, 'audio', { position: 'top', trackId: 'v1' });
    assert.equal(top.tracks[2].type, 'audio');
    assert.notEqual(top.tracks[2].trackId, 'v1', 'a taken id is replaced');
    assertValid(top);
  });

  it('never reuses a name that is taken', () => {
    const edl = renameTrack(createEdl(), 'a1', 'Video 2');
    assert.equal(nextTrackName(edl, 'video'), 'Video 3');
  });
});

describe('removeTrack', () => {
  const doc = () =>
    deepFreeze(
      testEdl({
        v2: [testClip('t', 0, 2, { linkedClipId: 's' })],
        v1: [],
        a1: [testClip('s', 0, 2, { linkedClipId: 't' })],
      }),
    );

  it('removes the track with its clips and clears links into it', () => {
    const out = assertValid(removeTrack(doc(), 'v2'));
    assert.deepEqual(ids(out), ['v1', 'a1']);
    assert.equal(clipOf(out, 's').linkedClipId, '');
  });

  it('refuses the last track of a type, a locked track and an unknown id', () => {
    const start = doc();
    assert.equal(removeTrack(start, 'a1'), start);
    assert.equal(removeTrack(start, 'nope'), start);
    const locked = deepFreeze(toggleTrackLock(start, 'v2'));
    assert.equal(removeTrack(locked, 'v2'), locked);
  });
});

describe('moveTrack', () => {
  const doc = () => deepFreeze(testEdl({ v3: [], v2: [], v1: [], a1: [], a2: [] }));

  it('reorders inside its type and clamps the index', () => {
    assert.deepEqual(ids(moveTrack(doc(), 'v1', 0)), ['v1', 'v3', 'v2', 'a1', 'a2']);
    assert.deepEqual(ids(moveTrack(doc(), 'v3', 99)), ['v2', 'v1', 'v3', 'a1', 'a2']);
    assert.deepEqual(ids(moveTrack(doc(), 'a2', 0)), ['v3', 'v2', 'v1', 'a2', 'a1']);
    assert.deepEqual(ids(moveTrack(doc(), 'a1', -5)), ['v3', 'v2', 'v1', 'a1', 'a2']);
  });

  it('returns the same document when nothing moves', () => {
    const start = doc();
    assert.equal(moveTrack(start, 'v2', 1), start);
    assert.equal(moveTrack(start, 'ghost', 1), start);
    assert.equal(moveTrack(start, 'v2', NaN), start);
  });
});

describe('track header fields', () => {
  it('renames, toggles mute / solo / lock and sets the volume', () => {
    const start = deepFreeze(createEdl());
    assert.equal(renameTrack(start, 'v1', 'Main').tracks[0].name, 'Main');
    assert.equal(toggleTrackMute(start, 'a1').tracks[1].muted, true);
    assert.equal(toggleTrackSolo(start, 'a1').tracks[1].solo, true);
    const locked = toggleTrackLock(start, 'v1');
    assert.equal(locked.tracks[0].locked, true);
    assert.equal(toggleTrackLock(locked, 'v1').tracks[0].locked, false);
    assert.equal(setTrackVolume(start, 'a1', 0.25).tracks[1].volume, 0.25);
    assert.equal(setTrackVolume(start, 'a1', 9).tracks[1].volume, 2);
    assert.equal(setTrackVolume(start, 'a1', -1).tracks[1].volume, 0);
  });

  it('shares what it does not change and ignores bad input', () => {
    const start = deepFreeze(createEdl());
    const out = toggleTrackMute(start, 'a1');
    assert.equal(out.tracks[0], start.tracks[0]);
    assert.equal(renameTrack(start, 'v1', 'Video 1'), start);
    assert.equal(toggleTrackMute(start, 'ghost'), start);
    assert.equal(setTrackVolume(start, 'a1', NaN), start);
    const patched = updateTrack(start, 'v1', { name: 5, muted: 'yes', type: 'audio', clips: null });
    assert.equal(patched, start, 'type, clips and wrong types cannot be patched');
  });
});
