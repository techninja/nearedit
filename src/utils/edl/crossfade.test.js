import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moveClips } from './move.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const abc = () =>
  deepFreeze(testEdl({ v1: [testClip('a', 0, 5), testClip('b', 5, 9), testClip('c', 12, 15)] }));

/** a/b already cross-fading for 1 s, with deliberate fades on their outer edges. */
const faded = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 0, 5, { fadeIn: 1, fadeOut: 1 }),
        testClip('b', 4, 8, { fadeIn: 1, fadeOut: 0.5 }),
      ],
    }),
  );

describe('cross-fades (invariant 4)', () => {
  it('turns a partial overlap into a cross-fade pair', () => {
    const out = assertValid(moveClips(abc(), ['b'], { delta: -1 }));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 4-8', 'c 12-15']);
    assert.equal(clipOf(out, 'a').fadeOut, 1);
    assert.equal(clipOf(out, 'b').fadeIn, 1);
    assert.equal(clipOf(out, 'b').fadeOut, 0);
  });

  it('follows the overlap length while the drag continues', () => {
    const out = assertValid(moveClips(abc(), ['b'], { delta: -2.5 }));
    assert.equal(clipOf(out, 'a').fadeOut, 2.5);
    assert.equal(clipOf(out, 'b').fadeIn, 2.5);
  });

  it('resets automatic fades when the clips are pulled apart, keeps deliberate ones', () => {
    const out = assertValid(moveClips(faded(), ['b'], { delta: 3 }));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 7-11']);
    assert.equal(clipOf(out, 'a').fadeIn, 1, 'deliberate fade-in kept');
    assert.equal(clipOf(out, 'a').fadeOut, 0, 'automatic fade-out reset');
    assert.equal(clipOf(out, 'b').fadeIn, 0, 'automatic fade-in reset');
    assert.equal(clipOf(out, 'b').fadeOut, 0.5, 'deliberate fade-out kept');
  });

  it('a deliberate fade is overridden by an overlap and restored when the drag backs out', () => {
    const start = deepFreeze(
      testEdl({ v1: [testClip('a', 0, 5, { fadeOut: 0.5 }), testClip('b', 6, 9)] }),
    );
    const over = moveClips(start, ['b'], { delta: -3 });
    assert.equal(clipOf(over, 'a').fadeOut, 2);
    // Same gesture, pointer moved back: computed again from the starting document.
    const back = moveClips(start, ['b'], { delta: -0.5 });
    assert.equal(clipOf(back, 'a').fadeOut, 0.5);
  });

  it('shortens a deliberate fade that no longer fits beside the cross-fade', () => {
    const start = testEdl({ v1: [testClip('a', 0, 3, { fadeIn: 2 }), testClip('b', 5, 9)] });
    const out = assertValid(moveClips(start, ['b'], { delta: -4 }));
    assert.equal(clipOf(out, 'a').fadeOut, 2);
    assert.equal(clipOf(out, 'a').fadeIn, 1);
  });

  it('overwrites instead when auto-crossfade is off', () => {
    const out = assertValid(moveClips(abc(), ['b'], { delta: -1, autoCrossfade: false }));
    assert.deepEqual(layout(out).v1, ['a 0-4', 'b 4-8', 'c 12-15']);
    assert.equal(clipOf(out, 'a').sourceOut, 4);
    assert.equal(clipOf(out, 'a').fadeOut, 0);
  });

  it('keeps an existing cross-fade when a clip is nudged with auto-crossfade off', () => {
    const out = assertValid(moveClips(faded(), ['b'], { delta: -0.5, autoCrossfade: false }));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 3.5-7.5']);
    assert.equal(clipOf(out, 'a').fadeOut, 1.5);
  });

  it('a cross-fading pair that moves together keeps its fade, whatever the setting', () => {
    const out = assertValid(moveClips(faded(), ['a', 'b'], { delta: 10, autoCrossfade: false }));
    assert.deepEqual(layout(out).v1, ['a 10-15', 'b 14-18']);
    assert.deepEqual([clipOf(out, 'a').fadeOut, clipOf(out, 'b').fadeIn], [1, 1]);
    assert.deepEqual([clipOf(out, 'a').fadeIn, clipOf(out, 'b').fadeOut], [1, 0.5]);
  });

  it('containment: the moved clip splits the clip it lands inside', () => {
    const out = assertValid(moveClips(abc(), ['c'], { delta: -11 }));
    const [left, c, right] = out.tracks[0].clips;
    assert.deepEqual(
      [left.clipId, left.timelineStart, left.timelineEnd, left.sourceOut],
      ['a', 0, 1, 1],
    );
    assert.equal(c.clipId, 'c');
    assert.notEqual(right.clipId, 'a');
    assert.deepEqual(
      [right.timelineStart, right.timelineEnd, right.sourceIn, right.sourceOut],
      [4, 5, 4, 5],
    );
    assert.deepEqual([c.fadeIn, c.fadeOut, left.fadeOut, right.fadeIn], [0, 0, 0, 0]);
  });

  it('a clip that shares an edge with the one under it overwrites, never cross-fades', () => {
    const out = assertValid(moveClips(abc(), ['c'], { delta: -10 }));
    assert.deepEqual(layout(out).v1, ['a 0-2', 'c 2-5', 'b 5-9']);
  });

  it('covering a clip completely removes it', () => {
    const start = testEdl({ v1: [testClip('small', 2, 3), testClip('big', 10, 20)] });
    const out = assertValid(moveClips(start, ['big'], { delta: -9 }));
    assert.deepEqual(layout(out).v1, ['big 1-11']);
  });

  it('triple overlap: a clip dropped on a cross-fade overwrites both sides', () => {
    const start = testEdl({
      v1: [
        testClip('a', 0, 5, { fadeOut: 1 }),
        testClip('b', 4, 9, { fadeIn: 1 }),
        testClip('c', 12, 15),
      ],
    });
    const out = assertValid(moveClips(start, ['c'], { delta: -8.5 }));
    assert.deepEqual(layout(out).v1, ['a 0-3.5', 'c 3.5-6.5', 'b 6.5-9']);
    assert.equal(clipOf(out, 'a').fadeOut, 0);
    assert.equal(clipOf(out, 'b').fadeIn, 0);
    assert.equal(clipOf(out, 'b').sourceIn, 2.5);
  });

  it('cross-fades on both edges when a clip bridges a gap', () => {
    const start = testEdl({
      v1: [testClip('a', 0, 5), testClip('b', 8, 12), testClip('c', 20, 25)],
    });
    const out = assertValid(moveClips(start, ['c'], { delta: -16 }));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'c 4-9', 'b 8-12']);
    assert.deepEqual([clipOf(out, 'c').fadeIn, clipOf(out, 'c').fadeOut], [1, 1]);
  });

  it('shares everything it did not touch', () => {
    const start = abc();
    const out = moveClips(start, ['b'], { delta: -1 });
    assert.equal(out.tracks[1], start.tracks[1], 'untouched track keeps its identity');
    assert.equal(clipOf(out, 'c'), clipOf(start, 'c'), 'untouched clip keeps its identity');
    assert.equal(out.markers, start.markers);
    assert.equal(moveClips(start, ['b'], { delta: 0 }), start, 'no-op returns the same document');
  });
});

describe('overwrites keep linked partners consistent', () => {
  const linked = () =>
    deepFreeze(
      testEdl({
        v1: [testClip('a', 0, 10, { linkedClipId: 'a_snd' }), testClip('pic', 20, 22)],
        a1: [testClip('a_snd', 0, 10, { linkedClipId: 'a' })],
      }),
    );

  it('cuts the partner over the same range and re-links each side', () => {
    const out = assertValid(moveClips(linked(), ['pic'], { delta: -16 }));
    assert.deepEqual(
      layout(out).v1.map((s) => s.split(' ')[1]),
      ['0-4', '4-6', '6-10'],
    );
    assert.deepEqual(
      layout(out).a1.map((s) => s.split(' ')[1]),
      ['0-4', '6-10'],
    );
    const [vLeft, , vRight] = out.tracks[0].clips;
    const [aLeft, aRight] = out.tracks[1].clips;
    assert.deepEqual([vLeft.clipId, vLeft.linkedClipId], ['a', 'a_snd']);
    assert.equal(vRight.linkedClipId, aRight.clipId);
    assert.equal(aRight.linkedClipId, vRight.clipId);
    assert.equal(aLeft.clipId, 'a_snd');
    assert.equal(aRight.sourceIn, 6);
  });

  it('linked: false leaves the partner whole and unlinks the far half', () => {
    const out = assertValid(moveClips(linked(), ['pic'], { delta: -16, linked: false }));
    assert.deepEqual(layout(out).a1, ['a_snd 0-10']);
    const [vLeft, , vRight] = out.tracks[0].clips;
    assert.equal(vLeft.linkedClipId, 'a_snd');
    assert.equal(vRight.linkedClipId, '');
  });

  it('never cuts a partner on a locked track, and unlinks it when its clip is gone', () => {
    const start = toggleTrackLock(linked(), 'a1');
    const big = testEdl({
      v1: [testClip('a', 2, 4, { linkedClipId: 'a_snd' }), testClip('big', 10, 20)],
      a1: [testClip('a_snd', 2, 4, { linkedClipId: 'a' })],
    });
    const cutaway = assertValid(moveClips(start, ['pic'], { delta: -16 }));
    assert.deepEqual(layout(cutaway).a1, ['a_snd 0-10']);
    const gone = assertValid(moveClips(toggleTrackLock(big, 'a1'), ['big'], { delta: -9 }));
    assert.deepEqual(layout(gone), { v1: ['big 1-11'], a1: ['a_snd 2-4'] });
    assert.equal(
      clipOf(gone, 'a_snd').linkedClipId,
      '',
      'only the link of a locked clip may change',
    );
  });
});
