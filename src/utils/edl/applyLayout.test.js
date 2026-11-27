import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectorResult } from './apply.js';
import { toggleTrackLock, toggleTrackMute } from './trackOps.js';
import { assertValid, deepFreeze, testClip, testEdl } from './testkit.js';

const media = (clipId, start, end, extra = {}) => ({
  clipId,
  sourceFile: '/m/n.mp4',
  sourceIn: start,
  sourceOut: end,
  timelineStart: start,
  timelineEnd: end,
  ...extra,
});
const names = (edl) => edl.tracks.map((t) => `${t.type}:${t.name}`);
const idsOn = (edl, trackId) =>
  edl.tracks.find((t) => t.trackId === trackId).clips.map((c) => c.clipId);

describe('applyDirectorResult — replace adopts the result layout', () => {
  it('names the rows as the result names them and creates the missing ones', () => {
    const start = deepFreeze(testEdl({ v1: [testClip('old', 0, 4)], a1: [] }));
    const result = {
      mode: 'replace',
      tracks: [
        { type: 'video', index: 0, name: 'Titles', clips: [] },
        { type: 'video', index: 1, name: 'B-roll', clips: [] },
        { type: 'video', index: 2, name: 'Main', clips: [media('m', 0, 3)] },
        { type: 'audio', index: 0, name: 'Dialogue', clips: [media('d', 0, 3)] },
        { type: 'audio', index: 1, name: 'Music', clips: [] },
      ],
    };
    const out = assertValid(applyDirectorResult(start, result));
    assert.deepEqual(names(out), [
      'video:Titles',
      'video:B-roll',
      'video:Main',
      'audio:Dialogue',
      'audio:Music',
    ]);
    assert.equal(out.tracks[0].trackId, 'v1', 'the existing track is reused for row 0');
    assert.deepEqual(idsOn(out, out.tracks[2].trackId), ['m']);
  });

  it('keeps a row on the track it names, so mute and volume travel with it', () => {
    const base = testEdl({ v1: [testClip('a', 0, 4)], v2: [testClip('b', 0, 4)], a1: [] });
    const start = deepFreeze(toggleTrackMute(base, 'v2'));
    // The result puts a new captions row in front and sends v2 before v1.
    const result = {
      mode: 'replace',
      tracks: [
        { type: 'video', index: 0, name: 'Captions', trackId: 'new', clips: [] },
        {
          type: 'video',
          index: 1,
          trackId: 'v2',
          name: start.tracks[1].name,
          clips: [media('b', 0, 2)],
        },
        {
          type: 'video',
          index: 2,
          trackId: 'v1',
          name: start.tracks[0].name,
          clips: [media('a', 0, 2)],
        },
        { type: 'audio', index: 0, trackId: 'a1', name: start.tracks[2].name, clips: [] },
      ],
    };
    const out = assertValid(applyDirectorResult(start, result));
    assert.deepEqual(out.tracks.map((t) => t.trackId).slice(1), ['v2', 'v1', 'a1']);
    assert.equal(out.tracks[0].name, 'Captions');
    assert.equal(out.tracks[1].muted, true, 'v2 is still muted');
    assert.deepEqual([idsOn(out, 'v2'), idsOn(out, 'v1')], [['b'], ['a']], 'ids survive in place');
  });

  it('leaves tracks the result does not mention after the rows it does', () => {
    const start = deepFreeze(testEdl({ v1: [], v2: [testClip('k', 0, 2)], a1: [] }));
    const result = {
      mode: 'replace',
      tracks: [{ type: 'video', index: 0, trackId: 'v2', clips: [] }],
    };
    const out = assertValid(applyDirectorResult(start, result));
    assert.deepEqual(
      out.tracks.map((t) => t.trackId),
      ['v2', 'v1', 'a1'],
    );
    assert.deepEqual(idsOn(out, 'v2'), []);
  });

  it('never renames or empties a locked track', () => {
    const base = testEdl({ v1: [testClip('keep', 0, 4)], a1: [] });
    const start = deepFreeze(toggleTrackLock(base, 'v1'));
    const result = {
      mode: 'replace',
      tracks: [{ type: 'video', index: 0, name: 'Titles', clips: [media('keep', 0, 2)] }],
    };
    const out = assertValid(applyDirectorResult(start, result));
    const locked = out.tracks.find((t) => t.trackId === 'v1');
    assert.equal(locked.name, start.tracks[0].name);
    assert.deepEqual(idsOn(out, 'v1'), ['keep']);
    const added = out.tracks.find((t) => t.type === 'video' && t.trackId !== 'v1');
    assert.equal(added.clips.length, 1);
    assert.notEqual(added.clips[0].clipId, 'keep', 'the clashing id was replaced');
  });
});
