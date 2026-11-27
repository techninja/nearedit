import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyClips } from './clipboard.js';
import { addMarker } from './markers.js';
import { addRegion, regionsOf } from './regions.js';
import {
  MAX_REPEATS,
  pasteInsert,
  pasteRepeat,
  replayRippled,
  rippleMarks,
  trimToRange,
} from './selectionEdits.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const sample = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 0, 4, { linkedClipId: 'as' }),
        testClip('b', 6, 10),
        testClip('c', 12, 14),
      ],
      a1: [testClip('as', 0, 4, { linkedClipId: 'a' })],
      a2: [testClip('m', 0, 20)],
    }),
  );
const spans = (doc, trackId) => layout(doc)[trackId].map((entry) => entry.split(' ')[1]);

describe('trimToRange', () => {
  it('cuts away what lies outside the range and moves nothing', () => {
    const out = assertValid(trimToRange(sample(), ['a', 'as', 'b', 'm'], 2, 8));
    assert.deepEqual(layout(out), {
      v1: ['a 2-4', 'b 6-8', 'c 12-14'],
      a1: ['as 2-4'],
      a2: ['m 2-8'],
    });
    assert.equal(clipOf(out, 'a').sourceIn, 2, 'the picture still shows the same frames');
    assert.equal(clipOf(out, 'a').linkedClipId, 'as');
  });

  it('deletes a clip that is wholly outside, and leaves the rest of the document', () => {
    const doc = sample();
    const out = assertValid(trimToRange(doc, ['b', 'c'], 12, 13));
    assert.deepEqual(layout(out).v1, ['a 0-4', 'c 12-13']);
    assert.equal(out.tracks[2], doc.tracks[2], 'an untouched track is shared');
  });

  it('takes the range in either order and ignores an empty one, unknown or locked clips', () => {
    const doc = sample();
    assert.deepEqual(layout(trimToRange(doc, ['b'], 9, 7)).v1[1], 'b 7-9');
    assert.equal(trimToRange(doc, ['b'], 7, 7), doc);
    assert.equal(trimToRange(doc, ['zz'], 1, 2), doc);
    assert.equal(trimToRange(doc, [], 1, 2), doc);
    const locked = deepFreeze({
      ...doc,
      tracks: doc.tracks.map((track, i) => (i ? track : { ...track, locked: true })),
    });
    assert.equal(trimToRange(locked, ['b'], 7, 9), locked);
  });
});

describe('pasteInsert', () => {
  it('opens every track at the cursor and moves markers and regions', () => {
    let doc = addMarker(sample(), 9, { markerId: 'k' });
    doc = deepFreeze(addRegion(doc, 7, 13, { regionId: 'r' }));
    const out = assertValid(pasteInsert(doc, copyClips(doc, ['c']), { time: 8, trackId: 'v1' }));
    assert.deepEqual(spans(out, 'v1'), ['0-4', '6-8', '8-10', '10-12', '14-16']);
    assert.deepEqual(spans(out, 'a2'), ['0-8', '10-22'], 'the bed opens too');
    assert.equal(out.markers[0].time, 11);
    assert.deepEqual(
      regionsOf(out).map((r) => [r.start, r.end]),
      [[7, 15]],
      'a region across the cursor grows',
    );
  });

  it('does nothing without a payload', () => {
    const doc = sample();
    assert.equal(pasteInsert(doc, null, { time: 3 }), doc);
  });
});

describe('pasteRepeat', () => {
  it('pastes end to end', () => {
    const doc = sample();
    const out = assertValid(pasteRepeat(doc, copyClips(doc, ['c']), { time: 20, count: 3 }));
    assert.deepEqual(spans(out, 'v1').slice(3), ['20-22', '22-24', '24-26']);
    assert.equal(new Set(out.tracks[0].clips.map((clip) => clip.clipId)).size, 6);
  });

  it('pastes at a fixed interval, cross-fading copies that overlap', () => {
    const doc = sample();
    const payload = copyClips(doc, ['c']);
    const apart = pasteRepeat(doc, payload, { time: 20, count: 3, every: 5 });
    assert.deepEqual(spans(apart, 'v1').slice(3), ['20-22', '25-27', '30-32']);
    const close = assertValid(pasteRepeat(doc, payload, { time: 20, count: 2, every: 1.5 }));
    assert.deepEqual(spans(close, 'v1').slice(3), ['20-22', '21.5-23.5']);
    assert.equal(close.tracks[0].clips[4].fadeIn, 0.5);
  });

  it('keeps linked pairs linked in every copy and bounds the count', () => {
    const doc = sample();
    const out = assertValid(pasteRepeat(doc, copyClips(doc, ['a', 'as']), { time: 30, count: 2 }));
    const copies = out.tracks[0].clips.slice(3);
    for (const copy of copies)
      assert.equal(clipOf(out, copy.linkedClipId).linkedClipId, copy.clipId);
    assert.equal(pasteRepeat(doc, null, { count: 3 }), doc);
    const one = pasteRepeat(doc, copyClips(doc, ['c']), { time: 20, count: 0 });
    assert.equal(one.tracks[0].clips.length, 4, 'at least one copy');
    assert.equal(MAX_REPEATS, 500);
  });
});

describe('rippleMarks and replayRippled', () => {
  const marked = () => {
    let doc = addMarker(addMarker(sample(), 5, { markerId: 'm5' }), 9, { markerId: 'm9' });
    doc = addMarker(doc, 13, { markerId: 'm13' });
    return deepFreeze(addRegion(doc, 8, 13, { regionId: 'r' }));
  };

  it('shifts what follows a step and gathers what a closing step swallows', () => {
    const out = rippleMarks(marked(), [{ from: 10, by: -4 }]);
    assert.deepEqual(
      out.markers.map((marker) => marker.time),
      [5, 6, 9],
    );
    assert.deepEqual(
      regionsOf(out).map((r) => [r.start, r.end]),
      [[6, 9]],
    );
    const opened = rippleMarks(marked(), [
      { from: 9, by: 2 },
      { from: 13, by: 1 },
    ]);
    assert.deepEqual(
      opened.markers.map((marker) => marker.time),
      [5, 11, 16],
    );
  });

  it('replays a hand-written change within its scope', () => {
    const doc = marked();
    const change = {
      steps: [{ from: 10, by: -4 }],
      trackIds: ['v1'],
      removed: ['b'],
      placed: [],
      tracks: doc.tracks,
    };
    const track = assertValid(replayRippled(doc, change));
    assert.deepEqual(layout(track).v1, ['a 0-4', 'c 8-10']);
    assert.equal(track.markers, doc.markers);
    assert.equal(track.tracks[2], doc.tracks[2]);
    const all = assertValid(replayRippled(doc, change, { scope: 'all' }));
    assert.deepEqual(spans(all, 'a2'), ['0-20'], 'a clip that starts before the step stays');
    assert.equal(all.markers[2].time, 9);
  });
});
