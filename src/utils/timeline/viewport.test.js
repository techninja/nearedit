import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampScroll,
  contentWidth,
  edgeScrollSpeed,
  fitZoom,
  followScroll,
  timeToX,
  visibleTimes,
  wheelZoomFactor,
  xToTime,
  xToTimeRaw,
} from './viewport.js';

const vp = (over = {}) => ({ pps: 100, scrollX: 0, scrollY: 0, width: 1000, height: 300, ...over });

describe('viewport conversions', () => {
  it('maps seconds to pixels and back at any zoom and scroll', () => {
    const view = vp({ pps: 250, scrollX: 500 });
    assert.equal(timeToX(view, 2), 0);
    assert.equal(timeToX(view, 4), 500);
    assert.equal(xToTime(view, 500), 4);
    for (const time of [0, 0.033, 1.5, 3599.97]) {
      assert.ok(Math.abs(xToTime(view, timeToX(view, time)) - time) < 1e-9);
    }
  });

  it('never returns a negative time, but the raw conversion does', () => {
    assert.equal(xToTime(vp(), -50), 0);
    assert.equal(xToTimeRaw(vp(), -50), -0.5);
  });

  it('reports the visible time range', () => {
    assert.deepEqual(visibleTimes(vp({ scrollX: 200 })), { start: 2, end: 12 });
    assert.deepEqual(visibleTimes(vp({ pps: 2, scrollX: 0 })), { start: 0, end: 500 });
  });
});

describe('scrolling', () => {
  it('leaves room after the last clip and never shrinks below the view', () => {
    assert.equal(contentWidth(0, 100, 1000), 1000);
    assert.equal(contentWidth(60, 100, 1000), 6600);
    assert.ok(contentWidth(3600, 4000, 1200) > 14_000_000);
  });

  it('clamps a scroll position to the content', () => {
    assert.equal(clampScroll(-10, 5000, 1000), 0);
    assert.equal(clampScroll(4500, 5000, 1000), 4000);
    assert.equal(clampScroll(300, 800, 1000), 0);
  });

  it('follows the playhead a page at a time, not every frame', () => {
    const view = vp({ scrollX: 0 });
    assert.equal(followScroll(view, 5), null, 'visible: stay put');
    assert.equal(followScroll(view, 9.98), null);
    assert.equal(followScroll(view, 10.02), 902, 'left the right edge: page forward');
    assert.equal(followScroll(vp({ scrollX: 3000 }), 2), 100, 'behind the view: page back');
    assert.equal(followScroll(vp({ scrollX: 3000 }), 0.2), 0);
  });

  it('auto-scrolls faster the closer the pointer is to an edge', () => {
    assert.equal(edgeScrollSpeed(500, 1000), 0);
    assert.ok(edgeScrollSpeed(30, 1000) < 0);
    assert.ok(edgeScrollSpeed(2, 1000) < edgeScrollSpeed(30, 1000));
    assert.ok(edgeScrollSpeed(990, 1000) > edgeScrollSpeed(970, 1000));
    assert.equal(edgeScrollSpeed(-400, 1000), -28, 'capped beyond the edge');
  });
});

describe('zoom', () => {
  it('fits the whole timeline into the view within the zoom limits', () => {
    const zoom = fitZoom(120, 1200, 100, [0.02, 40]);
    assert.ok(Math.abs(120 * 100 * zoom - 1200 * 0.94) < 1e-6);
    assert.equal(fitZoom(100000, 1000, 100, [0.02, 40]), 0.02);
    assert.equal(fitZoom(0.01, 1000, 100, [0.02, 40]), 40);
    assert.equal(fitZoom(0, 1000, 100, [0.02, 40]), 1);
  });

  it('turns wheel movement into a smooth, bounded zoom factor', () => {
    assert.equal(wheelZoomFactor(0), 1);
    assert.ok(wheelZoomFactor(-100) > 1);
    assert.ok(wheelZoomFactor(100) < 1);
    assert.ok(Math.abs(wheelZoomFactor(-100) * wheelZoomFactor(100) - 1) < 1e-12);
    assert.equal(wheelZoomFactor(-100000), wheelZoomFactor(-240));
  });
});
