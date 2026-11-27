import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newClipIds } from './selection.js';
import { splitClips } from './split.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const pairs = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 0, 10, {
          sourceIn: 3,
          sourceOut: 13,
          fadeIn: 1,
          fadeOut: 2,
          linkedClipId: 'a_s',
          groupId: 'g',
        }),
        testClip('b', 12, 16),
      ],
      a1: [testClip('a_s', 0, 10, { sourceIn: 3, sourceOut: 13, linkedClipId: 'a' })],
      a2: [testClip('m', 2, 20)],
    }),
  );

describe('splitClips', () => {
  it('splits everything under the time; left keeps id + fade-in, right gets fade-out', () => {
    const start = pairs();
    const out = assertValid(splitClips(start, 4));
    assert.deepEqual(
      layout(out).v1.map((s) => s.split(' ')[1]),
      ['0-4', '4-10', '12-16'],
    );
    const [left, right] = out.tracks[0].clips;
    assert.equal(left.clipId, 'a');
    assert.deepEqual([left.fadeIn, left.fadeOut], [1, 0]);
    assert.deepEqual([right.fadeIn, right.fadeOut], [0, 2]);
    assert.deepEqual([left.sourceIn, left.sourceOut], [3, 7]);
    assert.deepEqual([right.sourceIn, right.sourceOut], [7, 13]);
    assert.equal(right.groupId, 'g', 'both halves stay in the group');
    assert.equal(newClipIds(start, out).length, 3, 'one new id per split clip');
    assert.deepEqual(
      layout(out).a1.map((s) => s.split(' ')[1]),
      ['0-4', '4-10'],
    );
    assert.deepEqual(
      layout(out).a2.map((s) => s.split(' ')[1]),
      ['2-4', '4-20'],
    );
  });

  it('re-links linked pairs on each side of the cut', () => {
    const out = splitClips(pairs(), 4, { clipIds: ['a'] });
    const [vLeft, vRight] = out.tracks[0].clips;
    const [aLeft, aRight] = out.tracks[1].clips;
    assert.deepEqual([vLeft.linkedClipId, aLeft.linkedClipId], ['a_s', 'a']);
    assert.equal(vRight.linkedClipId, aRight.clipId);
    assert.equal(aRight.linkedClipId, vRight.clipId);
    assert.deepEqual(layout(out).a2, ['m 2-20'], 'clips that were not asked for are left alone');
  });

  it('linked pair straddling the split: the uncut partner stays with the half on its side', () => {
    // Picture 0..10, sound only 6..9 (an L-cut). Split the picture at 4.
    const start = deepFreeze(
      testEdl({
        v1: [testClip('v', 0, 10, { linkedClipId: 's' })],
        a1: [testClip('s', 6, 9, { linkedClipId: 'v' })],
      }),
    );
    const out = assertValid(splitClips(start, 4));
    const [left, right] = out.tracks[0].clips;
    assert.equal(left.linkedClipId, '');
    assert.equal(right.linkedClipId, 's');
    assert.equal(clipOf(out, 's').linkedClipId, right.clipId);
    // Split at 9.5 instead: the sound lies left of the cut and stays with the left half.
    const late = assertValid(splitClips(start, 9.5));
    assert.equal(late.tracks[0].clips[0].linkedClipId, 's');
    assert.equal(late.tracks[0].clips[1].linkedClipId, '');
    assert.equal(clipOf(late, 's'), clipOf(start, 's'));
  });

  it('linked: false splits only the given clip', () => {
    const out = assertValid(splitClips(pairs(), 4, { clipIds: ['a'], linked: false }));
    assert.deepEqual(layout(out).a1, ['a_s 0-10']);
    assert.equal(out.tracks[0].clips[0].linkedClipId, 'a_s');
    assert.equal(out.tracks[0].clips[1].linkedClipId, '');
  });

  it('does nothing at a clip edge, outside clips, or on locked tracks', () => {
    const start = pairs();
    assert.equal(splitClips(start, 10, { clipIds: ['a'] }), start);
    assert.equal(splitClips(start, 11, { trackIds: ['v1'] }), start);
    const locked = deepFreeze(toggleTrackLock(start, 'v1'));
    const out = splitClips(locked, 4);
    assert.equal(out.tracks[0], locked.tracks[0]);
    assert.equal(out.tracks[1].clips.length, 2, 'the unlocked partner track is still split');
    assertValid(out);
  });

  it('snaps the split time to the frame grid', () => {
    const out = splitClips(pairs(), 4.02, { clipIds: ['a'], linked: false });
    assert.ok(Math.abs(out.tracks[0].clips[0].timelineEnd - 4 - 1 / 30) < 1e-9);
  });

  it('leaves two cross-fading clips alone when the time is inside their cross-fade', () => {
    const start = deepFreeze(
      testEdl({
        v1: [testClip('a', 0, 5, { fadeOut: 1 }), testClip('b', 4, 8, { fadeIn: 1 })],
        v2: [testClip('over', 0, 8)],
      }),
    );
    for (const time of [4, 4.5, 5]) {
      const out = assertValid(splitClips(start, time));
      assert.equal(out.tracks[0], start.tracks[0], 'v1 is untouched');
      assert.equal(layout(out).v2.length, 2, 'other clips under the time are still split');
      assert.equal(splitClips(start, time, { clipIds: ['a', 'b'] }), start);
    }
    // Outside the cross-fade both clips split normally and keep fading.
    const before = assertValid(splitClips(start, 3, { clipIds: ['a'] }));
    assert.deepEqual(
      layout(before).v1.map((s) => s.split(' ')[1]),
      ['0-3', '3-5', '4-8'],
    );
    assert.deepEqual(
      before.tracks[0].clips.map((c) => c.fadeOut),
      [0, 1, 0],
    );
  });

  it('cutFades turns a cross-fade under the time into a hard cut', () => {
    const start = deepFreeze(
      testEdl({ v1: [testClip('a', 0, 5, { fadeOut: 1 }), testClip('b', 4, 8, { fadeIn: 1 })] }),
    );
    const out = assertValid(splitClips(start, 4.5, { cutFades: true }));
    assert.deepEqual(layout(out).v1, ['a 0-4.5', 'b 4.5-8']);
    assert.deepEqual([clipOf(out, 'a').fadeOut, clipOf(out, 'b').fadeIn], [0, 0]);
    assert.deepEqual([clipOf(out, 'b').sourceIn, clipOf(out, 'b').sourceOut], [0.5, 4]);
    assert.deepEqual(layout(splitClips(start, 4, { cutFades: true })).v1, ['a 0-4', 'b 4-8']);
    assert.deepEqual(layout(splitClips(start, 5, { cutFades: true })).v1, ['a 0-5', 'b 5-8']);
  });
});
