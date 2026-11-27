import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRegion, regionsOf } from '#utils/edl/regions.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from '#utils/edl/testkit.js';
import { copyPreview } from './copy.js';
import { regionPreview } from './regions.js';
import { rollPreview, slidePreview, slipTrimPreview } from './slide.js';

const MODES = { snapping: false, ripple: false, autoCrossfade: true };
const src = (id, start, end, sourceIn, more = {}) =>
  testClip(id, start, end, { sourceIn, sourceOut: sourceIn + (end - start), ...more });
const row = () =>
  deepFreeze(
    testEdl({
      v2: [],
      v1: [src('a', 0, 4, 2, { linkedClipId: 'as' }), src('b', 4, 8, 1), src('c', 8, 12, 3)],
      a1: [src('as', 0, 4, 2, { linkedClipId: 'a' })],
    }),
  );
const snapAt = (time) => ({ threshold: 0.2, candidates: [{ time, type: 'marker' }] });
const spans = (doc, track) => layout(doc)[track].map((entry) => entry.split(' ')[1]);

describe('copyPreview', () => {
  it('leaves the originals and puts copies where the pointer went', () => {
    const base = row();
    const drag = { clipIds: ['c'], anchorId: 'c', delta: 5 };
    const { doc, guide } = copyPreview(base, drag, MODES);
    assertValid(doc);
    assert.deepEqual(spans(doc, 'v1'), ['0-4', '4-8', '8-12', '13-17']);
    assert.equal(clipOf(doc, 'c'), clipOf(base, 'c'), 'the original is untouched');
    assert.equal(guide, null);
    const copy = doc.tracks[1].clips[3];
    assert.notEqual(copy.clipId, 'c');
    assert.deepEqual([copy.sourceIn, copy.sourceOut], [3, 7]);
  });

  it('copies linked partners with their clip, each to its own kind of track', () => {
    const { doc } = copyPreview(
      row(),
      { clipIds: ['a'], anchorId: 'a', delta: 14, toTrackId: 'v2' },
      MODES,
    );
    assertValid(doc);
    assert.deepEqual([spans(doc, 'v2'), spans(doc, 'a1')], [['14-18'], ['0-4', '14-18']]);
    const [picture] = doc.tracks[0].clips;
    assert.equal(clipOf(doc, picture.linkedClipId).linkedClipId, picture.clipId);
    assert.equal(clipOf(doc, 'a').linkedClipId, 'as', 'the originals stay a pair');
  });

  it('snaps the copy, never goes before 0, and ignores a track of the other kind', () => {
    const drag = { clipIds: ['c'], anchorId: 'c', delta: 5.1, toTrackId: 'a1' };
    const snapped = copyPreview(row(), drag, { ...MODES, snapping: true }, snapAt(13));
    assert.deepEqual([spans(snapped.doc, 'v1')[3], snapped.guide], ['13-17', 13]);
    const early = copyPreview(row(), { clipIds: ['b'], anchorId: 'b', delta: -30 }, MODES);
    assert.equal(spans(early.doc, 'v1')[0], '0-4');
    const base = row();
    assert.equal(copyPreview(base, { clipIds: ['zz'], anchorId: 'zz', delta: 1 }, MODES).doc, base);
  });
});

describe('edge previews', () => {
  it('rolls a cut, snapping the cut itself', () => {
    const drag = { clipId: 'a', edge: 'end', time: 4.9 };
    const { doc, guide } = rollPreview(row(), drag, { ...MODES, snapping: true }, snapAt(5), {});
    assertValid(doc);
    assert.deepEqual([spans(doc, 'v1'), guide], [['0-5', '5-8', '8-12'], 5]);
    assert.deepEqual(spans(doc, 'a1'), ['0-5'], 'the linked sound follows its picture');
    const far = rollPreview(
      row(),
      { ...drag, time: 20 },
      { ...MODES, snapping: true },
      snapAt(20),
      {},
    );
    assert.equal(far.guide, null, 'no guide when a limit stopped the cut short');
  });

  it('slip-trims: the dragged edge keeps its frame', () => {
    const drag = { clipId: 'b', edge: 'end', time: 7 };
    const { doc, guide } = slipTrimPreview(row(), drag, MODES, undefined, {});
    const b = clipOf(assertValid(doc), 'b');
    assert.deepEqual(
      [b.timelineStart, b.timelineEnd, b.sourceIn, b.sourceOut, guide],
      [4, 7, 2, 5, null],
    );
  });
});

describe('slidePreview', () => {
  it('slides between the neighbours and snaps an edge of the clip', () => {
    const drag = { clipId: 'b', delta: 0.9 };
    const { doc, guide } = slidePreview(row(), drag, { ...MODES, snapping: true }, snapAt(9), {});
    assertValid(doc);
    assert.deepEqual([spans(doc, 'v1'), guide], [['0-5', '5-9', '9-12'], 9]);
    const plain = slidePreview(row(), { clipId: 'b', delta: -1.5 }, MODES, undefined, {});
    assert.deepEqual(spans(plain.doc, 'v1'), ['0-2.5', '2.5-6.5', '6.5-12']);
  });
});

describe('regionPreview', () => {
  const base = () => deepFreeze(addRegion(row(), 5, 9, { regionId: 'r', label: 'R' }));
  const span = (doc) => regionsOf(doc).map((region) => [region.start, region.end])[0];

  it('moves by the tag, resizes by an end, and snaps the dragged ends', () => {
    assert.deepEqual(
      span(regionPreview(base(), { regionId: 'r', part: 'body', delta: 2 }).doc),
      [7, 11],
    );
    assert.deepEqual(
      span(regionPreview(base(), { regionId: 'r', part: 'start', delta: 1 }).doc),
      [6, 9],
    );
    assert.deepEqual(
      span(regionPreview(base(), { regionId: 'r', part: 'end', delta: -1.5 }).doc),
      [5, 7.5],
    );
    const moved = regionPreview(base(), { regionId: 'r', part: 'body', delta: 2.9 }, snapAt(12));
    assert.deepEqual([span(moved.doc), moved.guide], [[8, 12], 12], 'its end found the target');
    const sized = regionPreview(base(), { regionId: 'r', part: 'start', delta: -0.9 }, snapAt(4));
    assert.deepEqual([span(sized.doc), sized.guide], [[4, 9], 4]);
    const doc = base();
    assert.equal(regionPreview(doc, { regionId: 'zz', part: 'body', delta: 2 }).doc, doc);
  });
});
