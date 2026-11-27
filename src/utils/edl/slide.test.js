import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from './factory.js';
import { rollEdit, slideClip, slipTrim } from './slide.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const F = 1 / 30;
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} ≠ ${expected}`);
const src = (id, start, end, sourceIn, more = {}) =>
  testClip(id, start, end, { sourceIn, sourceOut: sourceIn + (end - start), ...more });
const durations = { '/media/a.mp4': 7, '/media/b.mp4': 10, '/media/c.mp4': 10, '/media/x.mp4': 10 };
const opts = { sourceDurations: durations };

/** a 0-4 (source 2-6) | b 4-10 (source 1-7) | c 10-14 (source 3-7). */
const row = () =>
  deepFreeze(testEdl({ v1: [src('a', 0, 4, 2), src('b', 4, 10, 1), src('c', 10, 14, 3)] }));
const alone = (start, end, sourceIn) =>
  deepFreeze(testEdl({ v1: [src('x', start, end, sourceIn)] }));
const times = (doc, id) => {
  const clip = clipOf(doc, id);
  return [clip.timelineStart, clip.timelineEnd, clip.sourceIn, clip.sourceOut];
};
const same = (actual, expected, what) =>
  expected.forEach((value, i) => near(actual[i], value, `${what}[${i}]`));

describe('slipTrim', () => {
  it('shortens from the end while the end keeps its frame', () => {
    const out = assertValid(slipTrim(alone(2, 6, 3), 'x', 'end', 5, opts));
    same(times(out, 'x'), [2, 5, 4, 7], 'x');
  });

  it('lengthens the end by revealing earlier source', () => {
    same(times(slipTrim(alone(2, 6, 3), 'x', 'end', 7, opts), 'x'), [2, 7, 2, 7], 'x');
  });

  it('stops when the source has nothing earlier to reveal', () => {
    const out = assertValid(slipTrim(alone(2, 6, 0.5), 'x', 'end', 9, opts));
    same(times(out, 'x'), [2, 6.5, 0, 4.5], 'x');
  });

  it('trims the start with the start keeping its frame', () => {
    same(times(slipTrim(alone(2, 6, 3), 'x', 'start', 3, opts), 'x'), [3, 6, 3, 6], 'shorter');
    same(times(slipTrim(alone(2, 6, 3), 'x', 'start', 1, opts), 'x'), [1, 6, 3, 8], 'longer');
  });

  it('is held by the start of the timeline and the end of the source', () => {
    same(times(slipTrim(alone(1, 5, 3), 'x', 'start', -2, opts), 'x'), [0, 5, 3, 8], 'time 0');
    same(times(slipTrim(alone(4, 8, 5), 'x', 'start', 0, opts), 'x'), [3, 8, 5, 10], 'source end');
  });

  it('takes the linked partner along and trims a title plainly', () => {
    const doc = deepFreeze(
      testEdl({
        v1: [src('x', 2, 6, 3, { linkedClipId: 'xs' })],
        v2: [createClip({ clipId: 't', timelineEnd: 3, sourceOut: 3, text: { content: 'T' } })],
        a1: [src('xs', 2, 6, 3, { linkedClipId: 'x', sourceFile: '/media/x.mp4' })],
      }),
    );
    const out = assertValid(slipTrim(doc, 'x', 'end', 5, opts));
    same(times(out, 'xs'), [2, 5, 4, 7], 'partner');
    const title = clipOf(slipTrim(doc, 't', 'end', 5, opts), 't');
    assert.equal(title.timelineEnd, 5);
    assert.equal(slipTrim(doc, 'nope', 'end', 5), doc);
    assert.equal(slipTrim(doc, 'x', 'end', NaN), doc);
  });
});

describe('rollEdit', () => {
  it('moves the cut and leaves the outer edges alone', () => {
    const out = assertValid(rollEdit(row(), 'a', 'end', 5, opts));
    same(times(out, 'a'), [0, 5, 2, 7], 'a');
    same(times(out, 'b'), [5, 10, 2, 7], 'b');
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 5-10', 'c 10-14']);
    const back = assertValid(rollEdit(row(), 'b', 'start', 3.5, opts));
    assert.deepEqual(layout(back).v1, ['a 0-3.5', 'b 3.5-10', 'c 10-14']);
    same(times(back, 'b'), [3.5, 10, 0.5, 7], 'b');
  });

  it('goes only as far as both clips can', () => {
    const grown = rollEdit(row(), 'a', 'end', 8, opts);
    assert.deepEqual(layout(grown).v1, ['a 0-5', 'b 5-10', 'c 10-14'], 'a has 1 s of source left');
    const long = { sourceDurations: { ...durations, '/media/b.mp4': 100 } };
    const squeezed = assertValid(rollEdit(row(), 'b', 'end', 30, long));
    near(clipOf(squeezed, 'b').timelineEnd, 14 - F, 'c keeps one frame');
    near(clipOf(squeezed, 'c').timelineStart, 14 - F, 'the cut stays closed');
    const early = rollEdit(row(), 'b', 'start', 0, opts);
    assert.deepEqual(layout(early).v1[1], 'b 3-10', 'b has 1 s of source before its in point');
    near(clipOf(early, 'a').timelineEnd, 3, 'a follows');
  });

  it('carries a cross-fade along and falls back to a trim across a gap', () => {
    const faded = deepFreeze(
      testEdl({
        v1: [src('a', 0, 5, 1, { fadeOut: 1 }), src('b', 4, 10, 2, { fadeIn: 1 })],
      }),
    );
    const out = assertValid(rollEdit(faded, 'a', 'end', 6, opts));
    assert.deepEqual(layout(out).v1, ['a 0-6', 'b 5-10']);
    assert.equal(clipOf(out, 'b').fadeIn, 1);
    const gapped = deepFreeze(testEdl({ v1: [src('a', 0, 3, 2), src('b', 4, 10, 1)] }));
    assert.deepEqual(layout(rollEdit(gapped, 'a', 'end', 3.5, opts)).v1, ['a 0-3.5', 'b 4-10']);
  });

  it('rolls linked partners with their clips', () => {
    const doc = deepFreeze(
      testEdl({
        v1: [src('a', 0, 4, 2, { linkedClipId: 'as' }), src('b', 4, 10, 1, { linkedClipId: 'bs' })],
        a1: [src('as', 0, 4, 2, { linkedClipId: 'a' }), src('bs', 4, 10, 1, { linkedClipId: 'b' })],
      }),
    );
    const out = assertValid(rollEdit(doc, 'a', 'end', 3));
    assert.deepEqual(layout(out), { v1: ['a 0-3', 'b 3-10'], a1: ['as 0-3', 'bs 3-10'] });
  });
});

describe('slideClip', () => {
  it('moves the clip with its content and trims both neighbours', () => {
    const out = assertValid(slideClip(row(), 'b', 1, opts));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 5-11', 'c 11-14']);
    same(times(out, 'b'), [5, 11, 1, 7], 'b keeps its source');
    same(times(out, 'c'), [11, 14, 4, 7], 'c gave way');
    const back = assertValid(slideClip(row(), 'b', -2, opts));
    assert.deepEqual(layout(back).v1, ['a 0-2', 'b 2-8', 'c 8-14']);
    same(times(back, 'c'), [8, 14, 1, 7], 'c followed');
  });

  it('stops where a neighbour runs out', () => {
    const far = slideClip(row(), 'b', 3, opts);
    assert.deepEqual(layout(far).v1, ['a 0-5', 'b 5-11', 'c 11-14'], 'a has 1 s of source left');
    const left = assertValid(slideClip(row(), 'b', -9, opts));
    assert.deepEqual(layout(left).v1[1], 'b 1-7', 'c has 3 s before its in point');
    near(clipOf(left, 'a').timelineEnd, 1, 'a gave way');
  });

  it('crosses a gap freely, up to the next clip', () => {
    const doc = deepFreeze(
      testEdl({ v1: [src('a', 0, 4, 2), src('b', 4, 6, 1), src('c', 9, 14, 3)] }),
    );
    const out = assertValid(slideClip(doc, 'b', 8, opts));
    assert.deepEqual(layout(out).v1, ['a 0-5', 'b 5-7', 'c 9-14'], 'a limits it to 1 s');
    const free = deepFreeze(testEdl({ v1: [src('b', 4, 6, 1), src('c', 9, 14, 3)] }));
    assert.deepEqual(layout(slideClip(free, 'b', 8, opts)).v1, ['b 7-9', 'c 9-14']);
    assert.deepEqual(layout(slideClip(free, 'b', -9, opts)).v1, ['b 0-2', 'c 9-14']);
    assert.equal(slideClip(free, 'b', 0, opts), free);
    assert.equal(slideClip(free, 'zz', 1, opts), free);
  });

  it('slides the linked partner between its own neighbours', () => {
    const doc = deepFreeze(
      testEdl({
        v1: [src('a', 0, 4, 2), src('b', 4, 10, 1, { linkedClipId: 'bs' }), src('c', 10, 14, 3)],
        a1: [src('bs', 4, 10, 1, { linkedClipId: 'b' }), src('m', 10, 20, 5)],
      }),
    );
    const out = assertValid(slideClip(doc, 'b', 1));
    assert.deepEqual(layout(out), {
      v1: ['a 0-5', 'b 5-11', 'c 11-14'],
      a1: ['bs 5-11', 'm 11-20'],
    });
  });
});
