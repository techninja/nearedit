import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from './markers.js';
import { toggleTrackLock } from './trackOps.js';
import { trimClipEnd, trimClipStart } from './trim.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const FRAME = 1 / 30;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const sourceDurations = { '/media/a.mp4': 12, '/media/b.mp4': 20 };

/** a uses 2..7 of a 12 s source; b follows after a gap; c on another track. */
const doc = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 3, 8, { sourceIn: 2, sourceOut: 7, linkedClipId: 'a_s' }),
        testClip('b', 10, 14),
        testClip('still', 20, 25, { sourceFile: '/media/still.png' }),
      ],
      a1: [
        testClip('a_s', 3, 8, {
          sourceFile: '/media/a.mp4',
          sourceIn: 2,
          sourceOut: 7,
          linkedClipId: 'a',
        }),
        testClip('c', 9, 12),
      ],
    }),
  );

describe('trimClipEnd', () => {
  it('shortens the clip and its source range, with the linked partner', () => {
    const out = assertValid(trimClipEnd(doc(), 'a', 6));
    assert.deepEqual(layout(out).v1[0], 'a 3-6');
    assert.deepEqual(layout(out).a1[0], 'a_s 3-6');
    assert.deepEqual([clipOf(out, 'a').sourceIn, clipOf(out, 'a').sourceOut], [2, 5]);
  });

  it('linked: false trims only the clip (J/L cuts)', () => {
    const out = assertValid(trimClipEnd(doc(), 'a', 6, { linked: false }));
    assert.deepEqual(layout(out).a1[0], 'a_s 3-8');
  });

  it('stops at the end of the source when its duration is known', () => {
    const out = assertValid(trimClipEnd(doc(), 'a', 40, { sourceDurations }), { sourceDurations });
    assert.equal(clipOf(out, 'a').sourceOut, 12);
    assert.equal(clipOf(out, 'a').timelineEnd, 13);
    assert.equal(clipOf(out, 'a_s').timelineEnd, 13, 'the partner is limited with it');
  });

  it('extends freely when the source duration is unknown', () => {
    const out = assertValid(trimClipEnd(doc(), 'b', 18, { linked: false }));
    assert.equal(clipOf(out, 'b').sourceOut, 8);
  });

  it('never leaves less than one frame', () => {
    const out = assertValid(trimClipEnd(doc(), 'b', 2));
    near(clipOf(out, 'b').timelineEnd, 10 + FRAME);
    near(clipOf(out, 'b').sourceOut, FRAME);
  });

  it('images have a free duration', () => {
    const out = assertValid(trimClipEnd(doc(), 'still', 90, { sourceDurations }));
    assert.equal(clipOf(out, 'still').timelineEnd, 90);
  });

  it('dragging an edge over the next clip cross-fades, or overwrites with auto-crossfade off', () => {
    const fade = assertValid(trimClipEnd(doc(), 'b', 21, { linked: false }));
    assert.equal(clipOf(fade, 'b').fadeOut, 1);
    assert.equal(clipOf(fade, 'still').fadeIn, 1);
    const over = assertValid(trimClipEnd(doc(), 'b', 21, { autoCrossfade: false }));
    assert.deepEqual(layout(over).v1.slice(1), ['b 10-21', 'still 21-25']);
    const swallowed = assertValid(trimClipEnd(doc(), 'b', 26));
    assert.deepEqual(layout(swallowed).v1, ['a 3-8', 'b 10-26']);
  });

  it('does nothing on a locked track or for an unknown clip', () => {
    const locked = deepFreeze(toggleTrackLock(doc(), 'v1'));
    assert.equal(trimClipEnd(locked, 'a', 6), locked);
    assert.equal(trimClipEnd(locked, 'zzz', 6), locked);
  });

  it('snaps the edge when asked', () => {
    const start = deepFreeze(addMarker(doc(), 6.5));
    const out = trimClipEnd(start, 'a', 6.4, { snap: { threshold: 0.2 } });
    assert.equal(clipOf(out, 'a').timelineEnd, 6.5);
  });
});

describe('trimClipStart', () => {
  it('moves the left edge and advances sourceIn', () => {
    const out = assertValid(trimClipStart(doc(), 'a', 5));
    assert.deepEqual(layout(out).v1[0], 'a 5-8');
    assert.deepEqual([clipOf(out, 'a').sourceIn, clipOf(out, 'a').sourceOut], [4, 7]);
    assert.deepEqual([clipOf(out, 'a_s').sourceIn, clipOf(out, 'a_s').timelineStart], [4, 5]);
  });

  it('cannot reveal material before the start of the source', () => {
    const out = assertValid(trimClipStart(doc(), 'a', 0));
    assert.equal(clipOf(out, 'a').sourceIn, 0);
    assert.equal(clipOf(out, 'a').timelineStart, 1);
  });

  it('an image can grow to the left, down to time 0', () => {
    const out = assertValid(trimClipStart(doc(), 'still', -4));
    assert.deepEqual(layout(out).v1, ['still 0-25']);
    assert.ok(clipOf(out, 'still').sourceIn >= 0);
  });
});

describe('trims and cross-fades', () => {
  const faded = () =>
    deepFreeze(
      testEdl({
        v1: [
          testClip('a', 0, 5, { fadeOut: 1 }),
          testClip('b', 4, 9, { fadeIn: 1, fadeOut: 1 }),
          testClip('c', 8, 12, { fadeIn: 1 }),
        ],
      }),
    );

  it('trimming out of a cross-fade resets both automatic fades', () => {
    const out = assertValid(trimClipStart(faded(), 'b', 6));
    assert.equal(clipOf(out, 'a').fadeOut, 0);
    assert.equal(clipOf(out, 'b').fadeIn, 0);
    assert.equal(clipOf(out, 'b').fadeOut, 1, 'the other cross-fade is untouched');
  });

  it('a clip cannot be trimmed into the cross-fade on its other edge', () => {
    const out = assertValid(trimClipEnd(faded(), 'b', 1));
    near(clipOf(out, 'b').timelineEnd, 5 + FRAME);
    assert.equal(clipOf(out, 'a').fadeOut, 1);
    assert.equal(clipOf(out, 'c').fadeIn, 0);
  });

  it('a far-edge trim keeps an existing cross-fade even with auto-crossfade off', () => {
    const out = assertValid(trimClipEnd(faded(), 'c', 10, { autoCrossfade: false }));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 4-9', 'c 8-10']);
    assert.equal(clipOf(out, 'b').fadeOut, 1);
  });
});

describe('ripple trims', () => {
  it('end: later clips on the same track follow', () => {
    const out = assertValid(trimClipEnd(doc(), 'a', 6, { ripple: true }));
    assert.deepEqual(layout(out).v1, ['a 3-6', 'b 8-12', 'still 18-23']);
    assert.deepEqual(layout(out).a1, ['a_s 3-6', 'c 7-10'], 'the partner track ripples too');
  });

  it('end: scope "all" ripples every unlocked track and the markers', () => {
    const start = deepFreeze(toggleTrackLock(addMarker(addMarker(doc(), 5), 11), 'a1'));
    const out = assertValid(trimClipEnd(start, 'b', 16, { ripple: true, rippleScope: 'all' }));
    assert.deepEqual(layout(out).v1, ['a 3-8', 'b 10-16', 'still 22-27']);
    assert.deepEqual(layout(out).a1, ['a_s 3-8', 'c 9-12'], 'locked tracks never ripple');
    assert.deepEqual(
      out.markers.map((m) => m.time),
      [5, 11],
      'markers before the edit point stay',
    );
    const pulled = trimClipEnd(start, 'a', 7, { ripple: true, rippleScope: 'all', linked: false });
    assert.deepEqual(
      pulled.markers.map((m) => m.time),
      [5, 10],
    );
  });

  it('start: the clip stays where it is, its content and the rest move', () => {
    const out = assertValid(trimClipStart(doc(), 'a', 5, { ripple: true }));
    assert.deepEqual(layout(out).v1, ['a 3-6', 'b 8-12', 'still 18-23']);
    assert.deepEqual([clipOf(out, 'a').sourceIn, clipOf(out, 'a').sourceOut], [4, 7]);
  });

  it('keeps cross-fades intact while rippling', () => {
    const start = deepFreeze(
      testEdl({
        v1: [
          testClip('a', 0, 5, { fadeOut: 1 }),
          testClip('b', 4, 9, { fadeIn: 1 }),
          testClip('c', 9, 12),
        ],
      }),
    );
    const out = assertValid(trimClipEnd(start, 'a', 3, { ripple: true }));
    assert.deepEqual(layout(out).v1, ['a 0-3', 'b 2-7', 'c 7-10']);
    assert.equal(clipOf(out, 'a').fadeOut, 1);
    const least = assertValid(trimClipEnd(start, 'a', 0, { ripple: true }));
    assert.deepEqual(layout(least).v1, ['a 0-1.033', 'b 0.033-5.033', 'c 5.033-8.033']);
    assert.equal(clipOf(least, 'a').fadeOut, 1, 'never shorter than its fade plus a frame');
  });
});
