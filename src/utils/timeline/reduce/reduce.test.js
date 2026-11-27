import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker, snapCandidates } from '../../edl/index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from '../../edl/testkit.js';
import { marqueeSelection } from './marquee.js';
import { movePreview, movingClips, withDownstream } from './move.js';
import { trimPreview } from './trim.js';
import { fadePreview, markerPreview, slipPreview } from './tweaks.js';

const MODES = { snapping: true, ripple: false, autoCrossfade: true };
const link = (a, b) => ({ linkedClipId: b, clipId: a });

function sample() {
  return deepFreeze(
    testEdl({
      v2: [],
      v1: [testClip('a', 0, 4, link('a', 'as')), testClip('b', 6, 10), testClip('c', 12, 14)],
      a1: [testClip('as', 0, 4, link('as', 'a')), testClip('m', 5, 20)],
    }),
  );
}

/** Snap context the way a drag builds it: candidates without the moving clips. */
function snapFor(doc, exclude, threshold = 0.1, playhead) {
  return { threshold, candidates: snapCandidates(doc, { exclude, playhead }) };
}

describe('movePreview', () => {
  it('moves the selection with its linked partner, from the starting document', () => {
    const base = sample();
    const drag = { clipIds: ['a'], anchorId: 'a', delta: 1 };
    const { doc, guide } = movePreview(base, drag, { ...MODES, snapping: false });
    assert.equal(clipOf(doc, 'a').timelineStart, 1);
    assert.equal(clipOf(doc, 'as').timelineStart, 1);
    assert.equal(guide, null);
    assert.equal(movePreview(base, { ...drag, delta: 0 }, MODES).doc, base, 'back home = base');
    assertValid(doc);
  });

  it('snaps an edge to a neighbour and reports the guide time', () => {
    const base = sample();
    const snap = snapFor(base, movingClips(base, ['a'], false));
    const { doc, guide } = movePreview(
      base,
      { clipIds: ['a'], anchorId: 'a', delta: 1.95 },
      MODES,
      snap,
    );
    assert.equal(clipOf(doc, 'a').timelineEnd, 6, 'end snapped to the start of b');
    assert.equal(guide, 6);
    const off = movePreview(base, { clipIds: ['a'], anchorId: 'a', delta: 1.7 }, MODES, snap);
    assert.equal(off.guide, null);
    assert.ok(Math.abs(clipOf(off.doc, 'a').timelineStart - 1.7) < 1e-9);
  });

  it('does not snap when snapping is off', () => {
    const base = sample();
    const snap = snapFor(base, movingClips(base, ['a'], false));
    const modes = { ...MODES, snapping: false };
    const { doc, guide } = movePreview(
      base,
      { clipIds: ['a'], anchorId: 'a', delta: 1.95 },
      modes,
      snap,
    );
    assert.equal(guide, null);
    assert.ok(Math.abs(clipOf(doc, 'a').timelineEnd - 5.9667) < 1e-3);
  });

  it('snaps to the playhead and to markers', () => {
    const base = deepFreeze(addMarker(sample(), 21, { markerId: 'mk' }));
    const snap = snapFor(base, movingClips(base, ['c'], false), 0.1, 16.5);
    const toPlayhead = movePreview(
      base,
      { clipIds: ['c'], anchorId: 'c', delta: 4.45 },
      MODES,
      snap,
    );
    assert.equal(clipOf(toPlayhead.doc, 'c').timelineStart, 16.5);
    assert.equal(toPlayhead.guide, 16.5);
    const toMarker = movePreview(base, { clipIds: ['c'], anchorId: 'c', delta: 7.04 }, MODES, snap);
    assert.equal(clipOf(toMarker.doc, 'c').timelineEnd, 21);
  });

  it('cross-fades on overlap and removes the fades when pulled apart again', () => {
    const base = sample();
    const over = movePreview(base, { clipIds: ['b'], anchorId: 'b', delta: -3 }, MODES).doc;
    assert.equal(clipOf(over, 'a').fadeOut, 1);
    assert.equal(clipOf(over, 'b').fadeIn, 1);
    assertValid(over);
    const apart = movePreview(base, { clipIds: ['b'], anchorId: 'b', delta: -1 }, MODES).doc;
    assert.equal(clipOf(apart, 'a').fadeOut, 0);
    assert.equal(clipOf(apart, 'b').fadeIn, 0);
  });

  it('overwrites instead of fading when auto-crossfade is off', () => {
    const base = sample();
    const modes = { ...MODES, autoCrossfade: false };
    const { doc } = movePreview(base, { clipIds: ['b'], anchorId: 'b', delta: -3 }, modes);
    assert.equal(clipOf(doc, 'a').timelineEnd, 3);
    assert.equal(clipOf(doc, 'a').fadeOut, 0);
    assertValid(doc);
  });

  it('moves to another track of the same type', () => {
    const base = sample();
    const { doc } = movePreview(
      base,
      { clipIds: ['b'], anchorId: 'b', delta: 0, toTrackId: 'v2' },
      MODES,
    );
    assert.deepEqual(layout(doc).v2, ['b 6-10']);
    const audio = movePreview(
      base,
      { clipIds: ['b'], anchorId: 'b', delta: 0, toTrackId: 'a1' },
      MODES,
    );
    assert.equal(audio.doc, base, 'a video clip never lands on an audio track');
  });

  it('carries later clips on the same tracks in ripple mode', () => {
    const base = sample();
    assert.deepEqual(withDownstream(base, ['b']), ['b', 'c']);
    assert.deepEqual(withDownstream(base, ['a']).sort(), ['a', 'as', 'b', 'c', 'm']);
    const modes = { ...MODES, ripple: true, snapping: false };
    const { doc } = movePreview(base, { clipIds: ['b'], anchorId: 'b', delta: 2 }, modes);
    assert.deepEqual(layout(doc).v1, ['a 0-4', 'b 8-12', 'c 14-16']);
    assert.deepEqual(layout(doc).a1, ['as 0-4', 'm 5-20'], 'other tracks stay');
    const lifted = movePreview(
      base,
      { clipIds: ['b'], anchorId: 'b', delta: 2, toTrackId: 'v2' },
      modes,
    );
    assert.deepEqual(layout(lifted.doc).v2, ['b 8-12']);
    assert.deepEqual(layout(lifted.doc).v1, ['a 0-4', 'c 14-16']);
    assertValid(lifted.doc);
  });
});

describe('trimPreview', () => {
  const durations = { '/media/a.mp4': 5, '/media/as.mp4': 5, '/media/b.mp4': 10 };

  it('trims an edge to the pointer, linked partner included', () => {
    const base = sample();
    const modes = { ...MODES, snapping: false };
    const { doc } = trimPreview(
      base,
      { clipId: 'a', edge: 'end', time: 3 },
      modes,
      undefined,
      durations,
    );
    assert.equal(clipOf(doc, 'a').timelineEnd, 3);
    assert.equal(clipOf(doc, 'as').timelineEnd, 3);
    const start = trimPreview(
      base,
      { clipId: 'b', edge: 'start', time: 7 },
      modes,
      undefined,
      durations,
    );
    assert.equal(clipOf(start.doc, 'b').timelineStart, 7);
    assert.equal(clipOf(start.doc, 'b').sourceIn, 1);
  });

  it('stops at the source bounds and then shows no guide', () => {
    const base = sample();
    const snap = snapFor(base, ['a', 'as']);
    const out = trimPreview(base, { clipId: 'a', edge: 'end', time: 5.98 }, MODES, snap, durations);
    assert.equal(clipOf(out.doc, 'a').timelineEnd, 5, 'source is 5 s long');
    assert.equal(out.guide, null, 'the edge did not reach the snap target');
    const before = trimPreview(
      base,
      { clipId: 'b', edge: 'start', time: 2 },
      MODES,
      undefined,
      durations,
    );
    assert.equal(clipOf(before.doc, 'b').timelineStart, 6, 'sourceIn is already 0');
  });

  it('snaps the edge and reports the guide', () => {
    const base = sample();
    const snap = snapFor(base, ['b']);
    const { doc, guide } = trimPreview(
      base,
      { clipId: 'b', edge: 'start', time: 6.92 },
      MODES,
      snap,
      {
        '/media/b.mp4': 60,
      },
    );
    assert.equal(guide, null, 'nothing within reach of 6.92');
    assert.ok(Math.abs(clipOf(doc, 'b').timelineStart - 6.9333) < 1e-3);
    const near = trimPreview(base, { clipId: 'b', edge: 'end', time: 11.95 }, MODES, snap, {});
    assert.equal(clipOf(near.doc, 'b').timelineEnd, 12);
    assert.equal(near.guide, 12);
  });

  it('ripples later clips when ripple mode is on', () => {
    const base = sample();
    const modes = { ...MODES, ripple: true, snapping: false };
    const { doc } = trimPreview(
      base,
      { clipId: 'b', edge: 'end', time: 8 },
      modes,
      undefined,
      durations,
    );
    assert.deepEqual(layout(doc).v1, ['a 0-4', 'b 6-8', 'c 10-12']);
    assertValid(doc);
  });
});

describe('slip, fades and markers', () => {
  it('slips the source under the clip without moving it', () => {
    const base = deepFreeze(testEdl({ v1: [testClip('x', 2, 6, { sourceIn: 3, sourceOut: 7 })] }));
    const right = slipPreview(base, 'x', 1, { '/media/x.mp4': 10 });
    assert.deepEqual(
      [clipOf(right, 'x').sourceIn, clipOf(right, 'x').sourceOut, clipOf(right, 'x').timelineStart],
      [2, 6, 2],
    );
    const far = slipPreview(base, 'x', -50, { '/media/x.mp4': 10 });
    assert.equal(clipOf(far, 'x').sourceOut, 10, 'stops at the end of the source');
    assert.equal(clipOf(slipPreview(base, 'x', 50, {}), 'x').sourceIn, 0);
  });

  it('drags fade handles along the top edge', () => {
    const base = sample();
    assert.equal(clipOf(fadePreview(base, 'b', 'in', 7.5), 'b').fadeIn, 1.5);
    assert.equal(clipOf(fadePreview(base, 'b', 'out', 9), 'b').fadeOut, 1);
    assert.equal(clipOf(fadePreview(base, 'b', 'in', 2), 'b').fadeIn, 0, 'never negative');
    assert.equal(clipOf(fadePreview(base, 'b', 'in', 99), 'b').fadeIn, 4, 'fits the clip');
    assert.equal(fadePreview(base, 'nope', 'in', 1), base);
  });

  it('moves a marker, snapping to clip edges', () => {
    const base = deepFreeze(addMarker(sample(), 1, { markerId: 'mk' }));
    const snap = { threshold: 0.1, candidates: snapCandidates(base, { markers: false }) };
    const snapped = markerPreview(base, 'mk', 5.96, true, snap);
    assert.equal(snapped.doc.markers[0].time, 6);
    assert.equal(snapped.guide, 6);
    const free = markerPreview(base, 'mk', 5.96, false, snap);
    assert.ok(Math.abs(free.doc.markers[0].time - 5.9667) < 1e-3);
    assert.equal(free.guide, null);
  });
});

describe('marqueeSelection', () => {
  it('selects the clips a box touches, with their linked partners', () => {
    const base = sample();
    assert.deepEqual(marqueeSelection(base, { t0: 5, t1: 13, trackIds: ['v1'] }), ['b', 'c']);
    assert.deepEqual(marqueeSelection(base, { t0: 1, t1: 2, trackIds: ['v1'] }).sort(), [
      'a',
      'as',
    ]);
    assert.deepEqual(marqueeSelection(base, { t0: 4.2, t1: 4.8, trackIds: ['v1', 'a1'] }), []);
    assert.deepEqual(marqueeSelection(base, { t0: 0, t1: 99, trackIds: [] }), []);
  });

  it('toggles against the starting selection with a modifier', () => {
    const base = sample();
    const box = { t0: 5, t1: 13, trackIds: ['v1'] };
    assert.deepEqual(marqueeSelection(base, box, ['b', 'm'], true).sort(), ['c', 'm']);
    assert.deepEqual(marqueeSelection(base, box, ['m'], false), ['b', 'c']);
  });
});
