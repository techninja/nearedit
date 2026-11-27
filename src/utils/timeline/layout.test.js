import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testClip } from '../edl/testkit.js';
import {
  LANE_GAP,
  LANE_H,
  RULER_H,
  laneAt,
  laneY,
  lanesBetween,
  lanesHeight,
  layoutLanes,
  nearestLane,
} from './layout.js';
import { clipsAtTime, edgeOverlaps, firstEndingAfter, visibleSlice } from './visible.js';

const tracks = [
  { trackId: 'v2', type: 'video' },
  { trackId: 'v1', type: 'video' },
  { trackId: 'a1', type: 'audio' },
];

describe('lane layout', () => {
  const lanes = layoutLanes(tracks);

  it('stacks lanes in document order under the ruler', () => {
    assert.deepEqual(
      lanes.map((lane) => [lane.trackId, lane.top]),
      [
        ['v2', 0],
        ['v1', LANE_H + LANE_GAP],
        ['a1', 2 * (LANE_H + LANE_GAP)],
      ],
    );
    assert.equal(lanesHeight(lanes), 3 * LANE_H + 2 * LANE_GAP);
    assert.equal(laneY(lanes[1], 10), RULER_H + LANE_H + LANE_GAP - 10);
    assert.equal(lanesHeight([]), 0);
  });

  it('finds the lane under a point, honouring vertical scroll', () => {
    assert.equal(laneAt(lanes, RULER_H - 1), null, 'ruler');
    assert.equal(laneAt(lanes, RULER_H + 5).trackId, 'v2');
    assert.equal(laneAt(lanes, RULER_H + LANE_H + 5).trackId, 'v1');
    assert.equal(laneAt(lanes, RULER_H + 5, LANE_H + LANE_GAP).trackId, 'v1');
    assert.equal(laneAt(lanes, RULER_H + 3 * LANE_H + 50), null, 'below the last lane');
  });

  it('uses taller lanes for fingers', () => {
    const coarse = layoutLanes(tracks, 72);
    assert.equal(coarse[2].top, 2 * 73);
    assert.equal(coarse[0].height, 72);
  });

  it('picks the nearest lane while dragging outside the lanes', () => {
    assert.equal(nearestLane(lanes, -200).trackId, 'v2');
    assert.equal(nearestLane(lanes, 5000).trackId, 'a1');
    assert.equal(nearestLane([], 50), null);
  });

  it('lists the lanes a marquee touches', () => {
    const y = (lane, into) => RULER_H + lanes[lane].top + into;
    assert.deepEqual(lanesBetween(lanes, y(0, 10), y(0, 30)), ['v2']);
    assert.deepEqual(lanesBetween(lanes, y(2, 5), y(0, 50)), ['v2', 'v1', 'a1']);
    assert.deepEqual(lanesBetween(lanes, 0, RULER_H - 2), []);
  });
});

describe('visible clips', () => {
  const clips = [testClip('a', 0, 4), testClip('b', 3, 8), testClip('c', 10, 12)];

  it('binary-searches the first clip reaching into a range', () => {
    assert.equal(firstEndingAfter(clips, 0), 0);
    assert.equal(firstEndingAfter(clips, 4), 1);
    assert.equal(firstEndingAfter(clips, 9), 2);
    assert.equal(firstEndingAfter(clips, 12), 3);
    assert.equal(firstEndingAfter([], 5), 0);
  });

  it('slices a track to a time range', () => {
    assert.deepEqual(visibleSlice(clips, 5, 9), { from: 1, to: 2 });
    assert.deepEqual(visibleSlice(clips, 8, 10), { from: 2, to: 2 });
    assert.deepEqual(visibleSlice(clips, 0, 100), { from: 0, to: 3 });
  });

  it('agrees with a full scan on a thousand clips', () => {
    const many = Array.from({ length: 1000 }, (_, i) => testClip(`c${i}`, i * 3, i * 3 + 3.5));
    for (const [start, end] of [
      [0, 10],
      [1499.9, 1512],
      [2990, 4000],
      [3503.5, 3600],
    ]) {
      const expected = many.filter((c) => c.timelineEnd > start && c.timelineStart < end);
      const { from, to } = visibleSlice(many, start, end);
      assert.deepEqual(many.slice(from, to), expected);
    }
  });

  it('finds one clip at a time, two inside a cross-fade', () => {
    assert.deepEqual(
      clipsAtTime(clips, 3.5).map((found) => found.clip.clipId),
      ['a', 'b'],
    );
    assert.deepEqual(
      clipsAtTime(clips, 5).map((found) => found.index),
      [1],
    );
    assert.deepEqual(clipsAtTime(clips, 9), []);
  });

  it('measures the cross-fade on each edge', () => {
    assert.deepEqual(edgeOverlaps(clips, 0), { in: 0, out: 1 });
    assert.deepEqual(edgeOverlaps(clips, 1), { in: 1, out: 0 });
    assert.deepEqual(edgeOverlaps(clips, 2), { in: 0, out: 0 });
  });
});
