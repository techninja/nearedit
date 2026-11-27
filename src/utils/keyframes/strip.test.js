import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { assertValid, clipOf, deepFreeze, testEdl } from '#utils/edl/testkit.js';
import { pathLabel } from './labels.js';
import { dragDelta, fractionAt, keyId, stripRange, stripRows, timeAt } from './strip.js';
import { pressSelection, selectedKeys } from './stripSelection.js';
import { deleteKeys, moveKeys, movedIds, setEase, sharedEase } from './stripEdit.js';

/** A 10 s title at 2..12 with keys on x at 3, 4, 5 and on opacity at 4 and 20 (trimmed away). */
function doc() {
  const clip = createClip({
    clipId: 't',
    timelineStart: 2,
    timelineEnd: 12,
    text: { content: 'A' },
  });
  let edl = testEdl({ v1: [clip] });
  for (const [time, value] of [
    [3, 0],
    [4, 100],
    [5, 200],
  ]) {
    edl = setKeyframe(edl, 't', 'transform.x', time, value);
  }
  edl = setKeyframe(edl, 't', 'transform.opacity', 4, 0.5, { ease: 'hold' });
  edl = setKeyframe(edl, 't', 'transform.opacity', 20, 1);
  return deepFreeze(edl);
}
const times = (edl, path) => clipOf(edl, 't').keyframes[path].map((key) => key.t + 2);

describe('strip layout', () => {
  it('shows the whole clip, or just the span of its keys', () => {
    const clip = clipOf(doc(), 't');
    assert.deepEqual(stripRange(clip), { start: 2, end: 12 });
    const tight = stripRange(clip, 'keys');
    assert.ok(tight.start < 3 && tight.start >= 2 && tight.end > 5 && tight.end < 6);
    assert.equal(fractionAt({ start: 2, end: 12 }, 7), 0.5);
    assert.equal(timeAt({ start: 2, end: 12 }, 0.25), 4.5);
    assert.equal(timeAt({ start: 2, end: 12 }, 3), 12, 'clamped');
  });

  it('builds one labelled row per animated property with its keys in place', () => {
    const clip = clipOf(doc(), 't');
    const rows = stripRows(clip, stripRange(clip), pathLabel);
    assert.deepEqual(
      rows.map((row) => [row.label, row.keys.length, row.outside]),
      [
        ['Position X', 3, 0],
        ['Opacity', 1, 1],
      ],
    );
    assert.deepEqual(
      rows[0].keys.map((key) => key.at),
      [0.1, 0.2, 0.3],
    );
    assert.equal(rows[1].keys[0].ease, 'hold');
    assert.equal(rows[0].keys[1].id, keyId('transform.x', 4));
    assert.equal(selectedKeys(rows, [keyId('transform.x', 4), keyId('nope', 1)]).length, 1);
  });

  it('turns a drag into whole frames that keep the keys inside the clip', () => {
    const range = { start: 2, end: 12 };
    const drag = { fps: 30, times: [3, 5], clip: { timelineStart: 2, timelineEnd: 12 } };
    assert.equal(dragDelta(range, 30, 300, drag), 1);
    assert.equal(dragDelta(range, 1, 300, drag), 1 / 30);
    assert.equal(dragDelta(range, -3000, 300, drag), -1, 'the first key stops at the clip start');
    assert.equal(dragDelta(range, 3000, 300, drag), 7, 'the last key stops at the clip end');
    assert.equal(dragDelta(range, 30, 0, drag), 0);
  });

  it('selects on press: alone, or added and removed with a modifier', () => {
    assert.deepEqual(pressSelection(['a', 'b'], 'c', false), ['c']);
    assert.deepEqual(pressSelection(['a', 'b'], 'a', false), ['a', 'b'], 'keeps a set to drag');
    assert.deepEqual(pressSelection(['a'], 'b', true), ['a', 'b']);
    assert.deepEqual(pressSelection(['a', 'b'], 'a', true), ['b']);
  });
});

describe('strip edits', () => {
  const X = 'transform.x';
  const keys = (list) => list.map((time) => ({ path: X, time }));

  it('moves several keys together without one swallowing another', () => {
    const later = assertValid(moveKeys(doc(), 't', keys([3, 4]), 1));
    assert.deepEqual(times(later, X), [4, 5], 'the unselected key at 5 was replaced');
    assert.deepEqual(
      clipOf(later, 't').keyframes[X].map((key) => key.v),
      [0, 100],
    );
    const earlier = moveKeys(doc(), 't', keys([4, 5]), -0.5);
    assert.deepEqual(times(earlier, X), [3, 3.5, 4.5]);
    const base = doc();
    assert.equal(moveKeys(base, 't', keys([3]), 0), base);
    assert.deepEqual(movedIds(doc(), keys([3, 4]), 1), [keyId(X, 4), keyId(X, 5)]);
  });

  it('moves keys of different properties in one go', () => {
    const moved = moveKeys(
      doc(),
      't',
      [
        { path: X, time: 4 },
        { path: 'transform.opacity', time: 4 },
      ],
      2,
    );
    assert.deepEqual(times(moved, X), [3, 5, 6]);
    assert.equal(times(moved, 'transform.opacity')[0], 6);
  });

  it('deletes keys and sets their easing', () => {
    const fewer = assertValid(deleteKeys(doc(), 't', keys([3, 5])));
    assert.deepEqual(times(fewer, X), [4]);
    const eased = setEase(doc(), 't', keys([3, 4]), 'ease-in-out');
    assert.deepEqual(
      clipOf(eased, 't').keyframes[X].map((key) => key.ease),
      ['ease-in-out', 'ease-in-out', 'linear'],
    );
    assert.equal(sharedEase([{ ease: 'hold' }, { ease: 'hold' }]), 'hold');
    assert.equal(sharedEase([{ ease: 'hold' }, { ease: 'linear' }]), '');
    assert.equal(sharedEase([]), '');
  });
});
