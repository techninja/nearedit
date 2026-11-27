import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMarker,
  copyClips,
  deleteClips,
  moveClips,
  pasteClips,
  rippleDelete,
  splitClips,
  trimClipEnd,
  trimClipStart,
} from '#utils/edl/index.js';
import { addRegion, regionsOf } from '#utils/edl/regions.js';
import { replayRippled } from '#utils/edl/selectionEdits.js';
import { rollEdit, slideClip } from '#utils/edl/slide.js';
import { assertValid, deepFreeze, layout, testClip, testEdl } from '#utils/edl/testkit.js';
import { movePreview } from '#utils/timeline/reduce/move.js';
import { describeEdit } from './editChange.js';

/** a, b, c on v1 (a linked to its sound), a long bed on a2, two markers and a region. */
function sample() {
  let doc = testEdl({
    v1: [testClip('a', 0, 4, { linkedClipId: 'as' }), testClip('b', 6, 10), testClip('c', 12, 14)],
    a1: [testClip('as', 0, 4, { linkedClipId: 'a' })],
    a2: [testClip('m', 0, 8), testClip('n', 8, 20)],
  });
  doc = addMarker(addMarker(doc, 5, { markerId: 'm5' }), 13, { markerId: 'm13' });
  return deepFreeze(addRegion(doc, 11, 15, { regionId: 'r' }));
}
const ripple = (before, after, scope = 'track') => {
  const change = describeEdit(before, after);
  return change ? assertValid(replayRippled(before, change, { scope })) : after;
};
const marks = (doc) => [
  doc.markers.map((marker) => marker.time),
  regionsOf(doc).map((region) => [region.start, region.end]),
];

describe('describeEdit + replayRippled', () => {
  it('closes the hole of a delete exactly as rippleDelete does', () => {
    const doc = sample();
    const plain = deleteClips(doc, ['b']);
    assert.deepEqual(layout(ripple(doc, plain)), layout(rippleDelete(doc, ['b'])));
    assert.deepEqual(layout(ripple(doc, plain)).v1, ['a 0-4', 'c 8-10']);
    assert.deepEqual(marks(ripple(doc, plain)), marks(doc), 'track scope leaves the marks');
    const withMarks = ripple(doc, plain, 'marks');
    assert.deepEqual(layout(withMarks).a2, ['m 0-8', 'n 8-20'], 'other tracks stay');
    assert.deepEqual(marks(withMarks), [[5, 9], [[7, 11]]]);
    const all = ripple(doc, plain, 'all');
    assert.deepEqual(layout(all), layout(rippleDelete(doc, ['b'], { scope: 'all' })));
    assert.deepEqual(all.markers, rippleDelete(doc, ['b'], { scope: 'all' }).markers);
  });

  it('follows a trimmed end and a trimmed start like the ripple trims', () => {
    const doc = sample();
    for (const to of [8, 11.5]) {
      const plain = trimClipEnd(doc, 'b', to);
      const want = trimClipEnd(doc, 'b', to, { ripple: true });
      assert.deepEqual(layout(ripple(doc, plain)), layout(want), `end to ${to}`);
    }
    for (const to of [7, 5]) {
      const plain = trimClipStart(doc, 'b', to);
      const want = trimClipStart(doc, 'b', to, { ripple: true });
      assert.deepEqual(layout(ripple(doc, plain)), layout(want), `start to ${to}`);
    }
    const all = ripple(doc, trimClipEnd(doc, 'b', 8), 'all');
    const want = trimClipEnd(doc, 'b', 8, { ripple: true, rippleScope: 'all' });
    assert.deepEqual(layout(all), layout(want));
    assert.deepEqual(marks(all)[0], [5, 11]);
  });

  it('follows a move like dragging in ripple mode', () => {
    const doc = sample();
    for (const delta of [1.5, -1, 3]) {
      const drag = { clipIds: ['b'], anchorId: 'b', delta };
      const modes = { snapping: false, ripple: false, autoCrossfade: true };
      const plain = movePreview(doc, drag, modes).doc;
      const want = movePreview(doc, drag, { ...modes, ripple: true }).doc;
      assert.deepEqual(layout(ripple(doc, plain)), layout(want), `by ${delta}`);
    }
  });

  it('turns a paste over a clip into an insert, restoring what it overwrote', () => {
    const doc = sample();
    const payload = copyClips(doc, ['c']);
    const plain = pasteClips(doc, payload, { time: 7 });
    assert.equal(layout(plain).v1.length, 5, 'the paste cut b in two');
    const out = ripple(doc, plain);
    const spans = layout(out).v1.map((entry) => entry.split(' ')[1]);
    assert.deepEqual(spans, ['0-4', '6-7', '7-9', '9-12', '14-16']);
    assert.deepEqual(layout(out).a2, layout(doc).a2, 'only the pasted track ripples');
    const all = ripple(doc, plain, 'all');
    assert.deepEqual(
      layout(all).a2.map((entry) => entry.split(' ')[1]),
      ['0-7', '9-10', '10-22'],
      'every track opens at the paste',
    );
    assert.deepEqual(marks(all), [[5, 15], [[13, 17]]]);
  });

  it('has nothing to follow after a split, a roll, a slide or a fade', () => {
    const doc = sample();
    assert.equal(describeEdit(doc, splitClips(doc, 7)), null);
    assert.equal(describeEdit(doc, doc), null);
    const row = deepFreeze(
      testEdl({ v1: [testClip('a', 0, 4), testClip('b', 4, 8), testClip('c', 8, 12)] }),
    );
    assert.equal(describeEdit(row, rollEdit(row, 'a', 'end', 3)), null);
    assert.equal(describeEdit(row, slideClip(row, 'b', -1)), null);
    assert.equal(describeEdit(doc, addMarker(doc, 2)), null);
  });

  it('ignores a clip that only moved to another track', () => {
    const doc = deepFreeze(testEdl({ v1: [testClip('a', 0, 4)], v2: [] }));
    assert.equal(describeEdit(doc, moveClips(doc, ['a'], { toTrackId: 'v2' })), null);
  });

  it('keeps a deliberate fade and drops one an overlap made', () => {
    const doc = deepFreeze(
      testEdl({
        v1: [testClip('a', 0, 4, { fadeOut: 0.5 }), testClip('b', 6, 10), testClip('c', 10, 14)],
      }),
    );
    const plain = moveClips(doc, ['a'], { delta: 3 });
    assert.equal(plain.tracks[0].clips[0].fadeOut, 1, 'a cross-fades into b');
    const out = ripple(doc, plain);
    assert.deepEqual(layout(out).v1, ['a 3-7', 'b 9-13', 'c 13-17']);
    assert.equal(out.tracks[0].clips[0].fadeOut, 0.5, 'its own fade is back');
  });
});
