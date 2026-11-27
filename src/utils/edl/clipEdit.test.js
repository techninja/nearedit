import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteClips, setClipFades, slipClip, updateClip } from './clipEdit.js';
import { toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const doc = () =>
  deepFreeze(
    testEdl({
      v1: [
        testClip('a', 0, 5, { sourceIn: 2, sourceOut: 7, fadeOut: 1, linkedClipId: 'a_s' }),
        testClip('b', 4, 9, { fadeIn: 1 }),
        testClip('still', 12, 16, { sourceFile: '/media/still.png' }),
      ],
      a1: [
        testClip('a_s', 0, 5, {
          sourceFile: '/media/a.mp4',
          sourceIn: 2,
          sourceOut: 7,
          linkedClipId: 'a',
        }),
      ],
    }),
  );

describe('deleteClips', () => {
  it('deletes linked partners and resets the neighbour’s automatic fade', () => {
    const out = assertValid(deleteClips(doc(), ['a']));
    assert.deepEqual(layout(out), { v1: ['b 4-9', 'still 12-16'], a1: [] });
    assert.equal(clipOf(out, 'b').fadeIn, 0);
  });

  it('takes one id as well as a list', () => {
    assert.deepEqual(layout(deleteClips(doc(), 'still')).v1, ['a 0-5', 'b 4-9']);
  });

  it('linked: false keeps the partner and clears its link', () => {
    const out = assertValid(deleteClips(doc(), ['a'], { linked: false }));
    assert.equal(clipOf(out, 'a_s').linkedClipId, '');
  });

  it('never deletes from a locked track, but un-links a locked partner', () => {
    const start = deepFreeze(toggleTrackLock(doc(), 'a1'));
    assert.equal(deleteClips(start, ['a_s']), start);
    const out = assertValid(deleteClips(start, ['a']));
    assert.deepEqual(layout(out).a1, ['a_s 0-5']);
    assert.equal(clipOf(out, 'a_s').linkedClipId, '');
    assert.equal(deleteClips(start, ['missing']), start);
  });
});

describe('slipClip', () => {
  const sourceDurations = { '/media/a.mp4': 10 };

  it('shifts the source range of the clip and its partner, not the timeline', () => {
    const out = assertValid(slipClip(doc(), 'a', 1.5));
    assert.deepEqual([clipOf(out, 'a').sourceIn, clipOf(out, 'a').sourceOut], [3.5, 8.5]);
    assert.deepEqual([clipOf(out, 'a_s').sourceIn, clipOf(out, 'a_s').sourceOut], [3.5, 8.5]);
    assert.deepEqual(layout(out), layout(doc()));
  });

  it('stays inside the source: never below 0, never past a known duration', () => {
    const back = slipClip(doc(), 'a', -9);
    assert.deepEqual([clipOf(back, 'a').sourceIn, clipOf(back, 'a').sourceOut], [0, 5]);
    const forward = assertValid(slipClip(doc(), 'a', 9, { sourceDurations }), { sourceDurations });
    assert.deepEqual([clipOf(forward, 'a').sourceIn, clipOf(forward, 'a').sourceOut], [5, 10]);
    const free = slipClip(doc(), 'b', 100);
    assert.equal(clipOf(free, 'b').sourceIn, 100, 'unknown duration: no upper bound');
  });

  it('ignores images, locked clips and unknown ids', () => {
    const start = doc();
    assert.equal(slipClip(start, 'still', 2), start);
    assert.equal(slipClip(start, 'nope', 2), start);
    const locked = deepFreeze(toggleTrackLock(start, 'v1'));
    assert.equal(slipClip(locked, 'a', 2), locked);
  });
});

describe('setClipFades', () => {
  it('sets fades on free edges, snapped to frames', () => {
    const out = assertValid(setClipFades(doc(), 'still', { fadeIn: 1.01, fadeOut: 0.5 }));
    assert.deepEqual([clipOf(out, 'still').fadeIn, clipOf(out, 'still').fadeOut], [1, 0.5]);
  });

  it('clamps so that both fades fit (invariant 3): the one being set gives way', () => {
    const base = setClipFades(doc(), 'still', { fadeOut: 3 });
    const out = assertValid(setClipFades(base, 'still', { fadeIn: 3 }));
    assert.deepEqual([clipOf(out, 'still').fadeIn, clipOf(out, 'still').fadeOut], [1, 3]);
    const both = assertValid(setClipFades(doc(), 'still', { fadeIn: 9, fadeOut: 9 }));
    assert.deepEqual([clipOf(both, 'still').fadeIn, clipOf(both, 'still').fadeOut], [4, 0]);
    const negative = setClipFades(doc(), 'still', { fadeIn: -2 });
    assert.equal(clipOf(negative, 'still').fadeIn, 0);
  });

  it('cannot change a cross-fading edge, and fits the free edge beside it', () => {
    const start = doc();
    assert.equal(setClipFades(start, 'a', { fadeOut: 3 }), start);
    const out = assertValid(setClipFades(start, 'a', { fadeIn: 10 }));
    assert.deepEqual([clipOf(out, 'a').fadeIn, clipOf(out, 'a').fadeOut], [4, 1]);
    const locked = deepFreeze(toggleTrackLock(start, 'v1'));
    assert.equal(setClipFades(locked, 'still', { fadeIn: 1 }), locked);
  });
});

describe('updateClip', () => {
  it('deep-merges inspector edits and leaves the rest of the clip alone', () => {
    const start = doc();
    const out = assertValid(
      updateClip(start, 'a', {
        label: 'Intro',
        volume: 0.5,
        transform: { x: 40, kenBurns: { enabled: true, endScale: 1.3 } },
        text: { content: 'Hello', fontSize: 96 },
      }),
    );
    const a = clipOf(out, 'a');
    assert.deepEqual([a.label, a.volume, a.transform.x, a.transform.scaleX], ['Intro', 0.5, 40, 1]);
    assert.deepEqual([a.transform.kenBurns.enabled, a.transform.kenBurns.endScale], [true, 1.3]);
    assert.equal(a.transform.kenBurns.startScale, 1);
    assert.deepEqual([a.text.content, a.text.fontSize, a.text.align], ['Hello', 96, 'center']);
    assert.equal(clipOf(out, 'b'), clipOf(start, 'b'));
    assert.equal(clipOf(start, 'a').label, '', 'input not mutated');
  });

  it('ignores structural fields, wrong types and unknown keys; clamps ranges', () => {
    const start = doc();
    const out = updateClip(start, 'a', {
      clipId: 'hacked',
      timelineStart: 99,
      fadeOut: 0,
      linkedClipId: '',
      volume: 7,
      label: { not: 'a string' },
      bogus: true,
      transform: { opacity: -3, fit: 'stretch', cropLeft: 'x', rotation: '45' },
    });
    const a = assertValid(out) && clipOf(out, 'a');
    assert.deepEqual([a.clipId, a.timelineStart, a.fadeOut, a.linkedClipId], ['a', 0, 1, 'a_s']);
    assert.deepEqual([a.volume, a.label, a.bogus], [2, '', undefined]);
    assert.deepEqual([a.transform.opacity, a.transform.fit, a.transform.cropLeft], [0, 'cover', 0]);
    assert.equal(a.transform.rotation, 45, 'numeric strings from form inputs are accepted');
    assert.equal(updateClip(start, 'a', { label: '' }), start, 'no change, same document');
  });

  it('replacing the source keeps invariant 1', () => {
    const placeholder = testClip('ph', 0, 4, { sourceFile: '', placeholder: true, sourceOut: 0 });
    const start = deepFreeze(testEdl({ v1: [placeholder] }));
    const out = assertValid(
      updateClip(start, 'ph', { sourceFile: '/media/real.mp4', placeholder: false, sourceIn: 12 }),
    );
    assert.deepEqual([clipOf(out, 'ph').sourceIn, clipOf(out, 'ph').sourceOut], [12, 16]);
    const locked = deepFreeze(toggleTrackLock(start, 'v1'));
    assert.equal(updateClip(locked, 'ph', { label: 'x' }), locked);
  });
});
