import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from './markers.js';
import { snapCandidates, snapEdges, snapMove, snapTime, snapTimes } from './snap.js';
import { deepFreeze, testClip, testEdl } from './testkit.js';

const doc = () =>
  deepFreeze(
    addMarker(
      testEdl({ v1: [testClip('a', 1, 4), testClip('b', 6, 9)], a1: [testClip('s', 2, 5)] }),
      10,
      { markerId: 'mk' },
    ),
  );

describe('snapCandidates', () => {
  it('lists playhead, markers, clip edges, time 0 and extras', () => {
    const list = snapCandidates(doc(), { playhead: 7.5, extra: [3.3, NaN] });
    assert.deepEqual(list[0], { time: 7.5, type: 'playhead' });
    assert.deepEqual(list[1], { time: 10, type: 'marker', id: 'mk' });
    assert.ok(
      list.some((c) => c.type === 'clip' && c.id === 'b' && c.edge === 'end' && c.time === 9),
    );
    assert.ok(list.some((c) => c.type === 'origin' && c.time === 0));
    assert.deepEqual(
      list.filter((c) => c.type === 'extra').map((c) => c.time),
      [3.3],
    );
    assert.equal(list.length, 1 + 1 + 6 + 1 + 1);
  });

  it('can leave out clips, markers and excluded clips', () => {
    const none = snapCandidates(doc(), { clips: false, markers: false });
    assert.deepEqual(none, [{ time: 0, type: 'origin' }]);
    const skipped = snapCandidates(doc(), { exclude: ['a', 's'] });
    assert.deepEqual(
      skipped.filter((c) => c.type === 'clip').map((c) => c.id),
      ['b', 'b'],
    );
  });

  it('reuses a precomputed list', () => {
    const candidates = [{ time: 42, type: 'extra' }];
    assert.equal(snapCandidates(doc(), { candidates }), candidates);
    assert.equal(snapTime(doc(), 41.95, { candidates }).time, 42);
  });
});

describe('snapTime', () => {
  it('snaps to the nearest candidate inside the threshold and says what it hit', () => {
    const hit = snapTime(doc(), 5.92, { threshold: 0.1 });
    assert.equal(hit.time, 6);
    assert.equal(hit.snapped, true);
    assert.deepEqual(hit.target, { time: 6, type: 'clip', id: 'b', edge: 'start' });
  });

  it('leaves the time alone outside the threshold', () => {
    assert.deepEqual(snapTime(doc(), 5.5, { threshold: 0.1 }), {
      time: 5.5,
      snapped: false,
      target: null,
    });
  });

  it('prefers the closest candidate, and the playhead on a tie', () => {
    const closest = snapTime(doc(), 4.4, { threshold: 1 });
    assert.equal(closest.target.id, 'a');
    const tie = snapTime(doc(), 4, { threshold: 1, playhead: 4 });
    assert.equal(tie.target.type, 'playhead');
  });

  it('snaps to time 0 and to beats', () => {
    assert.equal(snapTime(doc(), 0.04, {}).target.type, 'origin');
    const beat = snapTime(doc(), 7.48, { extra: [7, 7.5, 8], threshold: 0.05 });
    assert.deepEqual(beat.target, { time: 7.5, type: 'extra' });
  });
});

describe('snapEdges / snapTimes / snapMove', () => {
  it('snaps a span by whichever edge is nearest a candidate', () => {
    const byEnd = snapEdges(doc(), 3.4, 5.9, { threshold: 0.2 });
    assert.equal(byEnd.edge, 'end');
    assert.ok(Math.abs(byEnd.delta - 0.1) < 1e-9);
    assert.ok(Math.abs(byEnd.start - 3.5) < 1e-9);
    const byStart = snapEdges(doc(), 9.05, 11.5, { threshold: 0.2 });
    assert.equal(byStart.edge, 'start');
    assert.equal(byStart.target.id, 'b');
    const none = snapEdges(doc(), 12, 13, { threshold: 0.2 });
    assert.deepEqual([none.snapped, none.edge, none.delta, none.target], [false, null, 0, null]);
  });

  it('snapTimes reports which of several times snapped', () => {
    const hit = snapTimes(doc(), [20, 30, 9.98], { threshold: 0.05 });
    assert.equal(hit.index, 2);
    assert.equal(hit.target.id, 'mk');
    assert.ok(Math.abs(hit.delta - 0.02) < 1e-9);
  });

  it('snapMove ignores the edges of the clips being dragged', () => {
    // Dragging "a" by 0.05: its own edges (1 and 4) must not hold it in place.
    const self = snapMove(doc(), ['a'], 0.05, { threshold: 0.1 });
    assert.equal(self.snapped, false);
    assert.equal(self.delta, 0.05);
    // Dragging by 1.95 brings its end (4 → 5.95) next to b's start at 6.
    const hit = snapMove(doc(), ['a'], 1.95, { threshold: 0.1 });
    assert.deepEqual([hit.target.id, hit.target.edge, hit.edge], ['b', 'start', 'end']);
    assert.ok(Math.abs(hit.delta - 2) < 1e-9);
    assert.equal(snapMove(doc(), ['ghost'], 3).snapped, false);
  });
});
