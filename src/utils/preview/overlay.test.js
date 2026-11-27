import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { boxBounds } from './boxQuery.js';
import { dragValues } from './dragValues.js';
import { clipBox } from './geometry.js';
import { boxStyle, guideStyle, overlayTarget, titleRect } from './overlayModel.js';

const OUT = { width: 1920, height: 1080 };
const title = (extra = {}) =>
  createClip({
    clipId: 't',
    timelineEnd: 10,
    text: { content: 'Hi\nthere', fontSize: 100 },
    ...extra,
  });

describe('overlay model', () => {
  it('boxes the text block of a title, centred in the frame', () => {
    // every character 50 px wide, as a stand-in for the font
    const rect = titleRect(title().text, OUT, (run) => run.length * 50);
    assert.deepEqual(rect, { x: 810, y: 395, width: 300, height: 290 });
    const empty = titleRect({ content: '', fontSize: 1 }, OUT, () => 0);
    assert.ok(empty.width >= 24 && empty.height >= 24, 'always something to grab');
  });

  it('works on the front-most selected clip that is in the picture', () => {
    const edl = testEdl({ v0: [title()], v1: [testClip('v', 0, 10)] });
    const boxOf = (layer) => clipBox(edl, layer.clip, 1, layer.kind === 'video' ? OUT : null);
    assert.equal(overlayTarget(edl, ['v', 't'], 1, boxOf).layer.clip.clipId, 't');
    assert.equal(overlayTarget(edl, ['v'], 1, boxOf).layer.clip.clipId, 'v');
    assert.equal(overlayTarget(edl, ['t'], 12, boxOf), null, 'not in the picture then');
    assert.equal(overlayTarget(edl, [], 1, boxOf), null);
    assert.equal(
      overlayTarget(edl, ['v'], 1, () => null),
      null,
      'size not known yet',
    );
  });

  it('offers no move while ken burns drives the picture, unless it is keyframed', () => {
    const moving = testClip('v', 0, 10, {
      transform: { kenBurns: { enabled: true, endScale: 1.2 } },
    });
    let edl = testEdl({ v1: [moving] });
    const boxOf = (layer) => clipBox(edl, layer.clip, 1, OUT);
    assert.equal(overlayTarget(edl, ['v'], 1, boxOf).movable, false);
    for (const key of ['x', 'y', 'scaleX', 'scaleY']) {
      edl = setKeyframe(edl, 'v', `transform.${key}`, 0, 1);
    }
    assert.equal(overlayTarget(edl, ['v'], 1, boxOf).movable, true);
    const locked = { ...edl, tracks: edl.tracks.map((track) => ({ ...track, locked: true })) };
    assert.equal(overlayTarget(locked, ['v'], 1, boxOf).locked, true);
  });

  it('writes a box and a guide as CSS in percent of the frame', () => {
    const clip = title({ transform: { x: 192, scaleX: 0.5, scaleY: 0.5, rotation: 30 } });
    assert.deepEqual(boxStyle(clipBox(testEdl(), clip, 0), OUT), {
      left: '35%',
      top: '25%',
      width: '50%',
      height: '50%',
      transform: 'rotate(30deg)',
      transformOrigin: '50% 50%',
    });
    assert.deepEqual(guideStyle({ axis: 'x', at: 960 }, OUT), {
      left: '50%',
      top: '0',
      bottom: '0',
      width: '1px',
    });
    assert.equal(guideStyle({ axis: 'y', at: 1080 }, OUT).top, '100%');
  });
});

describe('dragValues', () => {
  const rect = { left: 0, top: 0, width: 960, height: 540 };
  const start = (mode, point, transform = { scaleX: 0.5, scaleY: 0.5 }) => {
    const box = clipBox(testEdl(), title({ transform }), 0);
    return { mode, start: { point, box }, bounds: boxBounds(box), rect, out: OUT, scale: 0.5 };
  };
  const at = (x, y, keys = {}) => ({ clientX: x, clientY: y, ...keys });

  it('moves by the pointer travel in output pixels and snaps unless Alt is held', () => {
    const drag = start('move', { x: 960, y: 540 });
    assert.deepEqual(dragValues(drag, at(580, 320)).values, {
      'transform.x': 200,
      'transform.y': 100,
    });
    const snapped = dragValues(drag, at(484, 268));
    assert.deepEqual(snapped.values, { 'transform.x': 0, 'transform.y': 0 });
    assert.equal(snapped.guides.length, 2);
    const free = dragValues(drag, at(484, 268, { altKey: true }));
    assert.deepEqual(free, { values: { 'transform.x': 8, 'transform.y': -4 }, guides: [] });
  });

  it('scales and rotates, with Shift as the constraint', () => {
    const scale = dragValues(start('scale', { x: 1440, y: 810 }), at(960, 540));
    assert.deepEqual(scale.values, { 'transform.scaleX': 1, 'transform.scaleY': 1 });
    const free = dragValues(start('scale', { x: 1440, y: 810 }), at(960, 405, { shiftKey: true }));
    assert.deepEqual(free.values, { 'transform.scaleX': 1, 'transform.scaleY': 0.5 });
    const turn = dragValues(start('rotate', { x: 960, y: 0 }), at(700, 270, { altKey: true }));
    assert.deepEqual(turn.values, { 'transform.rotation': 90 });
    const stepped = dragValues(start('rotate', { x: 960, y: 0 }), at(600, 150, { shiftKey: true }));
    assert.equal(stepped.values['transform.rotation'] % 15, 0);
  });
});
