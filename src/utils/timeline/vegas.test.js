import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from '#utils/edl/index.js';
import { addRegion } from '#utils/edl/regions.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { fadeLine } from './draw/fades.js';
import { stepEdge } from './edgeTrim.js';
import { pointerGestures } from './gestureList.js';
import { hitTest } from './hitTest.js';
import { COMPACT_LANE_H, MAX_LANE_H, MIN_LANE_H, laneHeightFor } from './laneSize.js';
import { LANE_H, LANE_H_COARSE, layoutLanes } from './layout.js';
import { fadesAt } from './menuFades.js';
import { CLIP_MENU, LANE_MENU, RULER_MENU } from './menuLists.js';
import { wheelAction } from './wheel.js';

describe('wheel modes', () => {
  const turn = (over) => ({ dx: 0, dy: 100, tracksOverflow: true, ...over });

  it('scroll mode: the wheel scrolls, Ctrl or Cmd zooms', () => {
    assert.deepEqual(wheelAction(turn()), { kind: 'scroll', dx: 0, dy: 100 });
    assert.deepEqual(wheelAction(turn({ tracksOverflow: false })), {
      kind: 'scroll',
      dx: 100,
      dy: 0,
    });
    assert.deepEqual(wheelAction(turn({ shiftKey: true, dx: 5 })), {
      kind: 'scroll',
      dx: 105,
      dy: 0,
    });
    const zoom = wheelAction(turn({ ctrlKey: true, dy: -100 }));
    assert.equal(zoom.kind, 'zoom');
    assert.ok(zoom.factor > 1, 'away from the user zooms in');
    assert.equal(wheelAction(turn({ metaKey: true })).kind, 'zoom');
    assert.deepEqual(wheelAction(turn(), 'nonsense'), wheelAction(turn(), 'scroll'));
  });

  it('vegas mode: the wheel zooms, Shift and Ctrl scroll, Ctrl+Shift moves the cursor', () => {
    const zoom = wheelAction(turn({ dy: -100, dx: 12 }), 'vegas');
    assert.equal(zoom.kind, 'zoom');
    assert.ok(zoom.factor > 1);
    assert.equal(zoom.dx, 12, 'sideways movement still scrolls time');
    assert.ok(wheelAction(turn(), 'vegas').factor < 1);
    assert.deepEqual(wheelAction(turn({ shiftKey: true }), 'vegas'), {
      kind: 'scroll',
      dx: 100,
      dy: 0,
    });
    assert.deepEqual(wheelAction(turn({ ctrlKey: true }), 'vegas'), {
      kind: 'scroll',
      dx: 0,
      dy: 100,
    });
    const cursor = wheelAction(turn({ ctrlKey: true, shiftKey: true }), 'vegas');
    assert.deepEqual(cursor, { kind: 'cursor', pixels: 10 });
    assert.equal(wheelAction(turn({ ctrlKey: true, shiftKey: true, dy: -50 }), 'vegas').pixels, -5);
  });
});

describe('lane height', () => {
  it('follows the pointer, the preference, and the minimised switch', () => {
    assert.equal(laneHeightFor({}), LANE_H);
    assert.equal(laneHeightFor({}, true), LANE_H_COARSE);
    assert.equal(laneHeightFor({ trackHeight: 96 }), 96);
    assert.equal(laneHeightFor({ trackHeight: 96 }, true), 96);
    assert.equal(laneHeightFor({ trackHeight: 5 }), MIN_LANE_H);
    assert.equal(laneHeightFor({ trackHeight: 5000 }), MAX_LANE_H);
    assert.equal(laneHeightFor({ trackHeight: 96, tracksMinimized: true }), MIN_LANE_H);
    assert.ok(MIN_LANE_H < COMPACT_LANE_H && COMPACT_LANE_H <= LANE_H);
  });
});

describe('edge-trim walking', () => {
  const doc = testEdl({ v1: [testClip('a', 0, 4), testClip('b', 4, 8), testClip('c', 9, 12)] });

  it('steps from edge to edge along the track', () => {
    assert.deepEqual(stepEdge(doc, { clipId: 'a', edge: 'start' }, 1), {
      clipId: 'a',
      edge: 'end',
    });
    assert.deepEqual(stepEdge(doc, { clipId: 'a', edge: 'end' }, 1), {
      clipId: 'b',
      edge: 'start',
    });
    assert.deepEqual(stepEdge(doc, { clipId: 'b', edge: 'start' }, -1), {
      clipId: 'a',
      edge: 'end',
    });
    assert.deepEqual(stepEdge(doc, { clipId: 'b', edge: 'end' }, -1), {
      clipId: 'b',
      edge: 'start',
    });
    assert.equal(stepEdge(doc, { clipId: 'a', edge: 'start' }, -1), null);
    assert.equal(stepEdge(doc, { clipId: 'c', edge: 'end' }, 1), null);
    assert.equal(stepEdge(doc, { clipId: 'gone', edge: 'end' }, 1), null);
  });
});

describe('fades under a point, and their lines', () => {
  const doc = testEdl({
    v1: [
      testClip('a', 0, 5, { fadeIn: 1, fadeOut: 1, fadeInCurve: 'smooth' }),
      testClip('b', 4, 9, { fadeIn: 1, fadeOut: 2, fadeOutCurve: 'fast' }),
    ],
  });
  const at = (time) => fadesAt(doc, { trackId: 'v1', time });

  it('finds a fade-in, a fade-out, both sides of a cross-fade, or nothing', () => {
    assert.deepEqual(at(0.5), [{ clipId: 'a', edge: 'in', curve: 'smooth' }]);
    assert.deepEqual(at(8), [{ clipId: 'b', edge: 'out', curve: 'fast' }]);
    assert.deepEqual(at(4.5), [
      { clipId: 'a', edge: 'out', curve: 'linear' },
      { clipId: 'b', edge: 'in', curve: 'linear' },
    ]);
    assert.deepEqual(at(2.5), []);
    assert.deepEqual(fadesAt(doc, { trackId: 'zz', time: 0.5 }), []);
  });

  it('draws a straight line for linear and a curve for the rest', () => {
    assert.deepEqual(fadeLine('in', 10, 0, 40, 100), [
      [10, 40],
      [110, 0],
    ]);
    assert.deepEqual(fadeLine('out', 200, 0, 40, 100), [
      [200, 40],
      [100, 0],
    ]);
    const smooth = fadeLine('in', 0, 0, 40, 120, 'smooth');
    assert.equal(smooth.length, 13);
    assert.deepEqual(smooth[6].map(Math.round), [60, 20], 'half way up at the middle');
    const fastIn = fadeLine('in', 0, 0, 40, 120, 'fast')[3];
    const slowIn = fadeLine('in', 0, 0, 40, 120, 'slow')[3];
    assert.ok(fastIn[1] < slowIn[1], 'fast is higher (louder) early on');
    // A fast fade-out drops early: near its start (far from the clip's end) it is already low.
    const fastOut = fadeLine('out', 120, 0, 40, 120, 'fast')[9];
    const slowOut = fadeLine('out', 120, 0, 40, 120, 'slow')[9];
    assert.ok(fastOut[1] > slowOut[1], 'fast-out is lower three quarters before the end');
    assert.deepEqual(fadeLine('in', 0, 0, 40, 100, 'no such curve'), fadeLine('in', 0, 0, 40, 100));
  });
});

describe('regions in the ruler', () => {
  let doc = testEdl({ v1: [testClip('a', 0, 4)] });
  doc = addRegion(addRegion(doc, 2, 6, { regionId: 'r1' }), 3, 4, { regionId: 'inner' });
  doc = addMarker(doc, 6, { markerId: 'm1' });
  const geo = {
    vp: { pps: 100, scrollX: 0, scrollY: 0, width: 1000, height: 300 },
    lanes: layoutLanes(doc.tracks),
    doc,
  };
  const hit = (x, y) => {
    const { regionId, regionPart, markerId } = hitTest(geo, x, y);
    return [regionId, regionPart, markerId || undefined];
  };

  it('takes an end anywhere in the time band, the body only on the row of tags', () => {
    assert.deepEqual(hit(202, 16), ['r1', 'start', undefined]);
    assert.deepEqual(hit(203, 30), ['r1', 'start', undefined]);
    assert.deepEqual(hit(250, 16), ['r1', 'body', undefined]);
    assert.deepEqual(hit(250, 30), [undefined, undefined, undefined], 'the tick row stays free');
    assert.deepEqual(hit(250, 4), [undefined, undefined, undefined], 'so does the loop band');
    assert.deepEqual(hit(350, 16), ['inner', 'body', undefined], 'the shortest of nested regions');
    assert.deepEqual(hit(398, 16), ['inner', 'end', undefined]);
    assert.deepEqual(hit(600, 16), [undefined, undefined, 'm1'], 'a marker on an end wins');
    assert.deepEqual(hit(800, 16), [undefined, undefined, undefined]);
  });
});

describe('lists for people', () => {
  it('describes the wheel as it is set, and every gesture once', () => {
    const scroll = pointerGestures('scroll');
    const vegas = pointerGestures('vegas');
    assert.ok(scroll.some(([, how]) => how === 'Ctrl + wheel, or pinch'));
    assert.ok(
      vegas.some(([what, how]) => what === 'Move the cursor' && how === 'Ctrl + Shift + wheel'),
    );
    for (const list of [scroll, vegas]) {
      assert.equal(new Set(list.map(([what]) => what)).size, list.length);
      for (const how of [
        'Ctrl + drag',
        'Alt + drag an edge',
        'Ctrl + Alt + drag an edge',
        'Ctrl + Alt + drag',
      ]) {
        assert.ok(
          list.some((row) => row[1] === how),
          how,
        );
      }
    }
    assert.deepEqual(pointerGestures(), scroll);
  });

  it('puts the new commands in the context menus', () => {
    assert.ok(CLIP_MENU.includes('edit.pasteInsert') && CLIP_MENU.includes('edit.trimToSelection'));
    assert.ok(LANE_MENU.includes('ripple.postAll') && LANE_MENU.includes('ripple.scopeMarks'));
    assert.ok(RULER_MENU.includes('region.add') && RULER_MENU.includes('go.toTime'));
  });
});
