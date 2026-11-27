import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { ROTATE_STEP, SCALE_RANGE, dragMove, dragRotate, dragScale } from './drag.js';
import { boxBounds, boxContains, framePoint } from './boxQuery.js';
import { boxCenter, boxCorners, clipBox, rotatePoint } from './geometry.js';
import { clipAtPoint, pickableLayers } from './hit.js';
import { SAFE_AREAS, shiftBounds, snapMove } from './snap.js';

const OUT = { width: 1920, height: 1080 };
const title = (transform = {}, extra = {}) =>
  createClip({ clipId: 't', timelineEnd: 10, text: { content: 'Hi' }, transform, ...extra });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const rect = (box) => [box.x, box.y, box.width, box.height];

describe('clipBox', () => {
  it('places a frame-sized source exactly as the compositor does', () => {
    const edl = testEdl();
    assert.deepEqual(rect(clipBox(edl, title(), 0)), [0, 0, 1920, 1080]);
    const moved = clipBox(
      edl,
      title({ x: 100, y: -50, scaleX: 0.5, scaleY: 0.5, rotation: 30 }),
      0,
    );
    assert.deepEqual(rect(moved), [580, 220, 960, 540]);
    assert.deepEqual(moved.pivot, { x: 1060, y: 490 });
    assert.equal(moved.rotation, 30);
  });

  it('places footage by its natural size and fit', () => {
    const clip = testClip('v', 0, 5, { transform: { fit: 'contain' } });
    const box = clipBox(testEdl(), clip, 0, { width: 1080, height: 1920 });
    assert.deepEqual(rect(box), [656.25, 0, 607.5, 1080]);
    const cover = clipBox(testEdl(), testClip('v', 0, 5), 0, { width: 1080, height: 1920 });
    near(cover.width, 1920);
    near(cover.y, (1080 - 1920 * (1920 / 1080)) / 2);
  });

  it('boxes just the text of a title, through the same transform', () => {
    const content = { x: 860, y: 490, width: 200, height: 100 };
    assert.deepEqual(rect(clipBox(testEdl(), title(), 0, null, content)), [860, 490, 200, 100]);
    const scaled = clipBox(testEdl(), title({ x: 100, scaleX: 2, scaleY: 2 }), 0, null, content);
    assert.deepEqual(rect(scaled), [860, 440, 400, 200]);
    assert.deepEqual(boxCenter(scaled), { x: 1060, y: 540 }, 'centred on the pivot');
  });

  it('follows keyframes: the box is where the clip is at that moment', () => {
    let edl = testEdl({ v1: [title()] });
    edl = setKeyframe(edl, 't', 'transform.x', 0, 0);
    edl = setKeyframe(edl, 't', 'transform.x', 2, 400);
    const clip = edl.tracks[0].clips[0];
    assert.equal(clipBox(edl, clip, 1).x, 200);
    assert.equal(clipBox(edl, clip, 5).x, 400);
  });

  it('knows the corners, the bounds and what is inside a rotated box', () => {
    const box = clipBox(testEdl(), title({ scaleX: 0.5, scaleY: 0.5, rotation: 90 }), 0);
    const corners = boxCorners(box);
    near(corners[0].x, 1230);
    near(corners[0].y, 60);
    const bounds = boxBounds(box);
    near(bounds.left, 690);
    near(bounds.right, 1230);
    near(bounds.top, 60);
    near(bounds.bottom, 1020);
    assert.equal(boxContains(box, { x: 960, y: 100 }), true);
    assert.equal(boxContains(box, { x: 600, y: 540 }), false, 'inside before rotation only');
    assert.equal(boxContains(box, { x: 680, y: 540 }, 12), true, 'within the slack');
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    near(p.x, 0);
    near(p.y, 10);
  });

  it('maps a pointer position into the output frame at any preview size', () => {
    const screen = { left: 100, top: 50, width: 640, height: 360 };
    assert.deepEqual(framePoint({ clientX: 420, clientY: 230 }, screen, OUT), { x: 960, y: 540 });
    assert.deepEqual(framePoint({ clientX: 100, clientY: 50 }, screen, OUT), { x: 0, y: 0 });
  });
});

describe('dragging', () => {
  const start = (transform, point) => ({ point, box: clipBox(testEdl(), title(transform), 0) });

  it('moves by the pointer travel, optionally along one axis', () => {
    const from = start({ x: 10, y: 20 }, { x: 500, y: 500 });
    assert.deepEqual(dragMove(from, { x: 530, y: 460 }), { x: 40, y: -20 });
    assert.deepEqual(dragMove(from, { x: 530, y: 490 }, { axis: true }), { x: 40, y: 20 });
    assert.deepEqual(dragMove(from, { x: 505, y: 400 }, { axis: true }), { x: 10, y: -80 });
  });

  it('scales about the centre so the grabbed corner follows the pointer', () => {
    const from = start({ scaleX: 0.5, scaleY: 0.5 }, { x: 1440, y: 810 });
    assert.deepEqual(dragScale(from, { x: 1920, y: 1080 }), { scaleX: 1, scaleY: 1 });
    assert.deepEqual(dragScale(from, { x: 1200, y: 675 }), { scaleX: 0.25, scaleY: 0.25 });
    assert.deepEqual(dragScale(from, { x: 1920, y: 810 }, { free: true }), {
      scaleX: 1,
      scaleY: 0.5,
    });
    assert.equal(dragScale(from, { x: 0, y: 0 }).scaleX, SCALE_RANGE.min, 'never through zero');
    const turned = start({ scaleX: 0.5, scaleY: 0.5, rotation: 90 }, { x: 1230, y: 60 });
    const grown = dragScale(turned, { x: 1500, y: -420 });
    near(grown.scaleX, 1, 1e-3);
    near(grown.scaleY, 1, 1e-3);
  });

  it('rotates by the angle swept about the pivot, with stops', () => {
    const from = start({ rotation: 10 }, { x: 960, y: 0 });
    assert.deepEqual(dragRotate(from, { x: 1500, y: 540 }), { rotation: 100 });
    assert.deepEqual(dragRotate(from, { x: 420, y: 540 }), { rotation: -80 });
    const almost = rotatePoint({ x: 960, y: 0 }, { x: 960, y: 540 }, 78.5);
    assert.deepEqual(dragRotate(from, almost, { snap: true }), { rotation: 90 });
    assert.deepEqual(dragRotate(from, almost), { rotation: 88.5 });
    const some = rotatePoint({ x: 960, y: 0 }, { x: 960, y: 540 }, 41);
    assert.equal(dragRotate(from, some, { stepped: true }).rotation % ROTATE_STEP, 0);
  });
});

describe('snapping and safe areas', () => {
  it('snaps the centre to the frame centre and edges to the frame edges', () => {
    const bounds = { left: 700, right: 910, top: 300, bottom: 400 };
    assert.deepEqual(snapMove(bounds, OUT, 10), { dx: 0, dy: 0, guides: [] });
    const centred = snapMove(shiftBounds(bounds, 157, 186), OUT, 10);
    assert.deepEqual(centred, {
      dx: -2,
      dy: 4,
      guides: [
        { axis: 'x', at: 960 },
        { axis: 'y', at: 540 },
      ],
    });
    const edge = snapMove({ left: 6, right: 206, top: 975, bottom: 1075 }, OUT, 10);
    assert.deepEqual(edge.guides, [
      { axis: 'x', at: 0 },
      { axis: 'y', at: 1080 },
    ]);
    assert.deepEqual([edge.dx, edge.dy], [-6, 5]);
    const full = snapMove({ left: 3, right: 1923, top: 0, bottom: 1080 }, OUT, 10);
    assert.deepEqual(full.guides[0], { axis: 'x', at: 960 }, 'a full-frame box shows the centre');
    assert.deepEqual(
      SAFE_AREAS.map((area) => area.inset),
      [0.05, 0.1],
    );
  });
});

describe('picking a clip', () => {
  const small = createClip({
    clipId: 'top',
    timelineEnd: 10,
    text: { content: 'A' },
    transform: { scaleX: 0.5, scaleY: 0.5 },
  });
  const edl = testEdl({
    v0: [small],
    v1: [testClip('under', 0, 10)],
    v2: [testClip('hidden', 0, 10)],
  });
  const boxOf = (layer) => clipBox(edl, layer.clip, 1);

  it('takes the front-most clip under the point and clicks through on request', () => {
    assert.deepEqual(
      pickableLayers(edl, 1).map((layer) => layer.clip.clipId),
      ['top', 'under', 'hidden'],
    );
    assert.equal(clipAtPoint(edl, 1, { x: 960, y: 540 }, boxOf), 'top');
    assert.equal(clipAtPoint(edl, 1, { x: 100, y: 100 }, boxOf), 'under');
    assert.equal(clipAtPoint(edl, 1, { x: 960, y: 540 }, boxOf, { beneath: 'top' }), 'under');
    assert.equal(clipAtPoint(edl, 1, { x: 960, y: 540 }, boxOf, { beneath: 'hidden' }), 'top');
    assert.equal(clipAtPoint(edl, 20, { x: 960, y: 540 }, boxOf), '');
    assert.equal(
      clipAtPoint(edl, 1, { x: 960, y: 540 }, () => null),
      '',
    );
  });

  it('leaves locked and muted tracks alone', () => {
    const locked = {
      ...edl,
      tracks: edl.tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)),
    };
    assert.equal(clipAtPoint(locked, 1, { x: 960, y: 540 }, boxOf), 'under');
    const muted = {
      ...edl,
      tracks: edl.tracks.map((t, i) => (i === 0 ? { ...t, muted: true } : t)),
    };
    assert.equal(clipAtPoint(muted, 1, { x: 960, y: 540 }, boxOf), 'under');
  });
});
