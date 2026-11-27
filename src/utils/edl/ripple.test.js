import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeGaps } from './gaps.js';
import { addMarker } from './markers.js';
import { rippleDelete, rippleDeleteRange, rippleInsert } from './ripple.js';
import { closedBefore, mergeSpans, subtractSpans } from './shift.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

/** v1/a1 hold three linked pairs back to back; a2 holds a music bed and a sting. */
const doc = () => {
  const pair = (id, start, end) => [
    testClip(id, start, end, { linkedClipId: `${id}_s` }),
    testClip(`${id}_s`, start, end, { linkedClipId: id }),
  ];
  const [a, as] = pair('a', 0, 4);
  const [b, bs] = pair('b', 4, 7);
  const [c, cs] = pair('c', 7, 12);
  const base = testEdl({
    v1: [a, b, c],
    a1: [as, bs, cs],
    a2: [testClip('music', 0, 6), testClip('sting', 9, 10)],
  });
  return deepFreeze(addMarker(addMarker(base, 2), 8));
};

describe('span arithmetic', () => {
  it('merges, subtracts and sums spans', () => {
    assert.deepEqual(mergeSpans([[5, 7], [0, 2], [2, 3], [6, 9]]), [[0, 3], [5, 9]]);
    assert.deepEqual(subtractSpans([[0, 10]], [[2, 3], [8, 12]]), [[0, 2], [3, 8]]);
    assert.deepEqual(subtractSpans([[0, 4]], [[0, 4]]), []);
    assert.equal(closedBefore([[0, 2], [5, 6]], 5.5), 2);
    assert.equal(closedBefore([[0, 2], [5, 6]], 6), 3);
  });
});

describe('rippleDelete', () => {
  it('scope "track": closes the hole on the tracks that lost a clip', () => {
    const out = assertValid(rippleDelete(doc(), ['b']));
    assert.deepEqual(layout(out).v1, ['a 0-4', 'c 4-9']);
    assert.deepEqual(layout(out).a1, ['a_s 0-4', 'c_s 4-9']);
    assert.deepEqual(layout(out).a2, ['music 0-6', 'sting 9-10'], 'other tracks stay');
    assert.deepEqual(out.markers.map((m) => m.time), [2, 8], 'markers stay');
  });

  it('scope "all": every unlocked track and the markers follow', () => {
    const out = assertValid(rippleDelete(doc(), ['b'], { scope: 'all' }));
    assert.deepEqual(layout(out).a2, ['music 0-6', 'sting 6-7']);
    assert.deepEqual(out.markers.map((m) => m.time), [2, 5]);
    const locked = deepFreeze(toggleTrackLock(doc(), 'a2'));
    const kept = assertValid(rippleDelete(locked, ['b'], { scope: 'all' }));
    assert.equal(kept.tracks[2], locked.tracks[2], 'a locked track never ripples');
  });

  it('a rippled clip that runs into something follows the overlap rules', () => {
    const start = deepFreeze(
      testEdl({
        v1: [testClip('a', 0, 4), testClip('b', 4, 7)],
        a2: [testClip('music', 0, 6), testClip('sting', 9, 11)],
      }),
    );
    // sting moves 9 → 5 and now overlaps the tail of the music bed (0..6).
    const out = assertValid(rippleDelete(start, ['a'], { scope: 'all' }));
    assert.deepEqual(layout(out).a2, ['music 0-6', 'sting 5-7']);
    assert.deepEqual([clipOf(out, 'music').fadeOut, clipOf(out, 'sting').fadeIn], [1, 1]);
    const hard = rippleDelete(start, ['a'], { scope: 'all', autoCrossfade: false });
    assert.deepEqual(layout(assertValid(hard)).a2, ['music 0-5', 'sting 5-7']);
  });

  it('only closes time that nothing on the edited tracks still covers', () => {
    const start = deepFreeze(
      testEdl({
        v1: [
          testClip('a', 0, 5, { fadeOut: 1 }),
          testClip('b', 4, 8, { fadeIn: 1, fadeOut: 1 }),
          testClip('c', 7, 10, { fadeIn: 1 }),
        ],
      }),
    );
    const out = assertValid(rippleDelete(start, ['b']));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'c 5-8']);
    assert.deepEqual([clipOf(out, 'a').fadeOut, clipOf(out, 'c').fadeIn], [0, 0]);
  });

  it('closes several holes at once and ignores locked or unknown clips', () => {
    const out = assertValid(rippleDelete(doc(), ['a', 'c']));
    assert.deepEqual(layout(out).v1, ['b 0-3']);
    const locked = deepFreeze(toggleTrackLock(doc(), 'v1'));
    assert.equal(rippleDelete(locked, ['b', 'ghost'], { linked: false }), locked);
  });
});

describe('rippleInsert', () => {
  it('opens a gap on every unlocked track, splitting clips that straddle it', () => {
    const start = doc();
    const out = assertValid(rippleInsert(start, 5, 2));
    assert.deepEqual(layout(out).v1.map((s) => s.split(' ')[1]), ['0-4', '4-5', '7-9', '9-14']);
    assert.deepEqual(layout(out).a2.map((s) => s.split(' ')[1]), ['0-5', '7-8', '11-12']);
    const [, bLeft, bRight] = out.tracks[0].clips;
    const [, sLeft, sRight] = out.tracks[1].clips;
    assert.deepEqual([bLeft.clipId, bLeft.linkedClipId], ['b', 'b_s']);
    assert.equal(bRight.linkedClipId, sRight.clipId, 'right halves are linked to each other');
    assert.equal(sLeft.clipId, 'b_s');
    assert.equal(bRight.sourceIn, 1);
    assert.deepEqual(out.markers.map((m) => m.time), [2, 10]);
  });

  it('can be limited to some tracks (markers then stay)', () => {
    const out = assertValid(rippleInsert(doc(), 4, 3, { trackIds: ['a2'] }));
    assert.deepEqual(layout(out).v1, layout(doc()).v1);
    assert.deepEqual(layout(out).a2.map((s) => s.split(' ')[1]), ['0-4', '7-9', '12-13']);
    assert.deepEqual(out.markers.map((m) => m.time), [2, 8]);
  });

  it('ignores a zero or negative duration', () => {
    const start = doc();
    assert.equal(rippleInsert(start, 5, 0), start);
    assert.equal(rippleInsert(start, 5, -1), start);
  });
});

describe('rippleDeleteRange', () => {
  it('cuts the range out of every unlocked track and closes it', () => {
    const out = assertValid(rippleDeleteRange(doc(), 3, 8));
    assert.deepEqual(layout(out).v1.map((s) => s.split(' ')[1]), ['0-3', '3-7']);
    assert.deepEqual(layout(out).a2.map((s) => s.split(' ')[1]), ['0-3', '4-5']);
    const tail = out.tracks[0].clips[1];
    assert.deepEqual([tail.sourceIn, tail.sourceOut], [1, 5]);
    assert.equal(tail.linkedClipId, out.tracks[1].clips[1].clipId);
    assert.deepEqual(out.markers.map((m) => m.time), [2, 3], 'markers inside vanish, later ones move');
  });

  it('accepts the range in either order and ignores an empty one', () => {
    const start = doc();
    assert.deepEqual(layout(rippleDeleteRange(start, 8, 3)).v1.length, 2);
    assert.equal(rippleDeleteRange(start, 3, 3), start);
  });
});

describe('closeGaps', () => {
  const gappy = () =>
    deepFreeze(
      testEdl({
        v1: [
          testClip('a', 2, 4, { linkedClipId: 'a_s' }),
          testClip('b', 6, 9, { fadeOut: 1 }),
          testClip('c', 8, 10, { fadeIn: 1 }),
          testClip('d', 15, 16),
        ],
        a1: [testClip('a_s', 2, 4, { linkedClipId: 'a' }), testClip('x', 20, 21)],
      }),
    );

  it('packs the track from time 0, keeping cross-fades and moving linked partners', () => {
    const out = assertValid(closeGaps(gappy(), 'v1'));
    assert.deepEqual(layout(out).v1, ['a 0-2', 'b 2-5', 'c 4-6', 'd 6-7']);
    assert.equal(clipOf(out, 'b').fadeOut, 1);
    assert.deepEqual(layout(out).a1, ['a_s 0-2', 'x 20-21']);
  });

  it('from: leaves everything before that time alone', () => {
    const out = assertValid(closeGaps(gappy(), 'v1', { from: 5 }));
    assert.deepEqual(layout(out).v1, ['a 2-4', 'b 5-8', 'c 7-9', 'd 9-10']);
  });

  it('does nothing on a packed, locked or unknown track', () => {
    const packed = closeGaps(gappy(), 'v1');
    assert.equal(closeGaps(packed, 'v1'), packed);
    const locked = deepFreeze(toggleTrackLock(gappy(), 'v1'));
    assert.equal(closeGaps(locked, 'v1'), locked);
    assert.equal(closeGaps(locked, 'nope'), locked);
  });
});
