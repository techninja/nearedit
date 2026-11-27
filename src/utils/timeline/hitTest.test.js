import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMarker } from '../edl/index.js';
import { testClip, testEdl } from '../edl/testkit.js';
import {
  activeCursor,
  chooseGesture,
  cursorFor,
  dragThreshold,
  isToggleClick,
} from './gestureChoice.js';
import { clipPartAt, hitTest } from './hitTest.js';
import { LANE_H, RULER_H, layoutLanes } from './layout.js';

function geometry(doc, over = {}) {
  const vp = { pps: 100, scrollX: 0, scrollY: 0, width: 1000, height: 300, ...over };
  return { vp, lanes: layoutLanes(doc.tracks), doc, coarse: !!over.coarse };
}

const doc = addMarker(
  testEdl({
    v1: [testClip('a', 0, 4), testClip('b', 3, 8, { fadeIn: 1 })],
    a1: [testClip('s', 1, 1.05)],
  }),
  5,
  { markerId: 'm1' },
);
const lane = (n, into = LANE_H / 2) => RULER_H + n * (LANE_H + 1) + into;

describe('hitTest', () => {
  it('describes the ruler: loop band, time band and markers', () => {
    const geo = geometry(doc);
    assert.deepEqual(hitTest(geo, 250, 3), { zone: 'ruler', time: 2.5, band: 'loop', markerId: '' });
    assert.equal(hitTest(geo, 250, 20).band, 'time');
    assert.equal(hitTest(geo, 503, 20).markerId, 'm1');
    assert.equal(hitTest(geo, 520, 20).markerId, '');
    assert.equal(hitTest(geo, 503, 3).markerId, '', 'the loop band is never a marker');
  });

  it('finds lanes and clips, with scroll and zoom applied', () => {
    const geo = geometry(doc, { pps: 50, scrollX: 100 });
    const hit = hitTest(geo, 150, lane(0));
    assert.equal(hit.time, 5);
    assert.equal(hit.trackId, 'v1');
    assert.equal(hit.clipId, 'b');
    assert.equal(hit.part, 'body');
    assert.equal(hitTest(geo, 400, lane(0)).clipId, undefined, 'past the last clip');
    assert.equal(hitTest(geo, 150, lane(1)).trackId, 'a1');
    assert.equal(hitTest(geo, 150, 280).zone, 'none');
  });

  it('separates body, trim edges and fade handles', () => {
    const geo = geometry(doc);
    assert.equal(hitTest(geo, 2, lane(0)).part, 'trim-start');
    assert.equal(hitTest(geo, 200, lane(0)).part, 'body');
    assert.equal(hitTest(geo, 797, lane(0)).part, 'trim-end');
    assert.equal(hitTest(geo, 3, lane(0, 6)).part, 'fade-in', 'top-left corner');
    assert.equal(hitTest(geo, 796, lane(0, 6)).part, 'fade-out', 'top-right corner');
    assert.equal(hitTest(geo, 500, lane(0, 6)).part, 'body');
  });

  it('gives no fade handle to a cross-fading edge and prefers edges inside the overlap', () => {
    const geo = geometry(doc);
    assert.deepEqual(
      [hitTest(geo, 303, lane(0)).clipId, hitTest(geo, 303, lane(0)).part],
      ['b', 'trim-start'],
    );
    assert.deepEqual(
      [hitTest(geo, 397, lane(0)).clipId, hitTest(geo, 397, lane(0)).part],
      ['a', 'trim-end'],
    );
    assert.equal(hitTest(geo, 350, lane(0)).clipId, 'b', 'the later clip is on top');
    assert.equal(hitTest(geo, 398, lane(0, 6)).part, 'trim-end', 'no fade-out handle on a');
    assert.equal(hitTest(geo, 400, lane(0, 6)).part, 'body', 'b fades over the overlap only');
  });

  it('keeps a body on a sliver of a clip', () => {
    const rect = { x0: 100, x1: 105 };
    const none = { in: 0, out: 0 };
    const flat = { fadeIn: 0, fadeOut: 0 };
    assert.equal(clipPartAt(100.5, 20, rect, flat, none), 'trim-start');
    assert.equal(clipPartAt(102.5, 20, rect, flat, none), 'body');
    assert.equal(clipPartAt(104.5, 20, rect, flat, none), 'trim-end');
    assert.equal(clipPartAt(102.5, 2, rect, flat, none), 'body', 'too narrow for fade handles');
    const geo = geometry(doc);
    assert.equal(hitTest(geo, 102.5, lane(1)).clipId, 's');
  });

  it('widens the zones for fingers', () => {
    const rect = { x0: 0, x1: 200 };
    const args = [30, rect, { fadeIn: 0, fadeOut: 0 }, { in: 0, out: 0 }];
    assert.equal(clipPartAt(12, ...args), 'body');
    assert.equal(clipPartAt(12, ...args, true), 'trim-start');
    assert.equal(clipPartAt(12, 16, rect, args[2], args[3], true), 'fade-in');
  });

  it('reports locked tracks', () => {
    const locked = { ...doc, tracks: doc.tracks.map((t) => ({ ...t, locked: true })) };
    assert.equal(hitTest(geometry(locked), 200, lane(0)).locked, true);
  });
});

describe('gesture choice', () => {
  const clip = (part) => ({ zone: 'lane', time: 1, trackId: 'v1', clipId: 'a', part });
  const empty = { zone: 'lane', time: 1, trackId: 'v1' };
  const ruler = (over = {}) => ({ zone: 'ruler', time: 1, band: 'time', markerId: '', ...over });

  it('maps what is under the pointer to a gesture', () => {
    assert.equal(chooseGesture(clip('body')), 'move');
    assert.equal(chooseGesture(clip('body'), { altKey: true }), 'slip');
    assert.equal(chooseGesture(clip('trim-start')), 'trim-start');
    assert.equal(chooseGesture(clip('trim-end'), { altKey: true }), 'trim-end');
    assert.equal(chooseGesture(clip('fade-in')), 'fade-in');
    assert.equal(chooseGesture(empty), 'marquee');
    assert.equal(chooseGesture({ ...clip('body'), locked: true }), 'marquee');
    assert.equal(chooseGesture(ruler()), 'scrub');
    assert.equal(chooseGesture(ruler({ band: 'loop' })), 'loop');
    assert.equal(chooseGesture(ruler(), { shiftKey: true }), 'loop');
    assert.equal(chooseGesture(ruler({ markerId: 'm1' })), 'marker');
    assert.equal(chooseGesture({ zone: 'none', time: 0 }), 'marquee');
  });

  it('pans with the middle button, the pan key, or a finger on empty space', () => {
    assert.equal(chooseGesture(clip('body'), { button: 1 }), 'pan');
    assert.equal(chooseGesture(clip('body'), { panKey: true }), 'pan');
    assert.equal(chooseGesture(empty, { pointerType: 'touch' }), 'pan');
    assert.equal(chooseGesture(clip('body'), { pointerType: 'touch' }), 'move');
    assert.equal(chooseGesture(clip('body'), { button: 2 }), 'none');
  });

  it('shows a cursor that says what a drag will do', () => {
    assert.equal(cursorFor(clip('body')), 'grab');
    assert.equal(cursorFor(clip('body'), { altKey: true }), 'ew-resize');
    assert.equal(cursorFor(clip('trim-start')), 'w-resize');
    assert.equal(cursorFor(clip('trim-end')), 'e-resize');
    assert.equal(cursorFor(clip('fade-in')), 'nesw-resize');
    assert.equal(cursorFor(clip('fade-out')), 'nwse-resize');
    assert.equal(cursorFor(ruler({ band: 'loop' })), 'col-resize');
    assert.equal(cursorFor(ruler({ markerId: 'm1' })), 'pointer');
    assert.equal(cursorFor({ ...clip('body'), locked: true }), 'not-allowed');
    assert.equal(cursorFor(empty, { panKey: true }), 'grab');
    assert.equal(activeCursor('move'), 'grabbing');
    assert.equal(activeCursor('pan'), 'grabbing');
    assert.equal(activeCursor('trim-end'), 'e-resize');
  });

  it('needs more travel from a finger than from a mouse before dragging', () => {
    assert.ok(dragThreshold('touch') > dragThreshold('mouse'));
    assert.equal(isToggleClick({ shiftKey: true }), true);
    assert.equal(isToggleClick({ metaKey: true }), true);
    assert.equal(isToggleClick({ altKey: true }), false);
  });
});
