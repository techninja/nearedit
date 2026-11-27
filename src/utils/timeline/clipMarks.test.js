import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addEffect } from '#utils/edl/effects.js';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { clipOf, testClip, testEdl } from '#utils/edl/testkit.js';
import {
  generatorColors,
  generatorLabel,
  hasActiveEffects,
  keyMarkAt,
  keyMarks,
  trackIsProcessed,
} from './clipMarks.js';
import { chooseGesture, cursorFor } from './gestureChoice.js';
import { hitTest } from './hitTest.js';
import { RULER_H, layoutLanes } from './layout.js';
import { keyframePreview } from './reduce/keyframes.js';
import { timeToX } from './viewport.js';

/** A 10 s title at 2..12 with keys at 3, 3.02 (same mark when zoomed out), 6 and 20 (trimmed away). */
function keyed() {
  const clip = createClip({
    clipId: 't',
    timelineStart: 2,
    timelineEnd: 12,
    text: { content: 'A' },
  });
  let edl = testEdl({ v1: [clip] });
  edl = setKeyframe(edl, 't', 'transform.x', 3, 0);
  edl = setKeyframe(edl, 't', 'transform.y', 3.1, 5);
  edl = setKeyframe(edl, 't', 'transform.x', 6, 100);
  edl = setKeyframe(edl, 't', 'transform.x', 20, 100);
  return edl;
}

describe('clip marks', () => {
  it('reads the colours a generator is set to, as its swatch', () => {
    assert.deepEqual(generatorColors({ type: 'solid', params: { color: '#ff0000' } }), ['#ff0000']);
    const gradient = generatorColors({ type: 'gradient', params: { color2: '#00ff00' } });
    assert.equal(gradient.length, 2, 'only the stops in use');
    assert.equal(gradient[1], '#00ff00');
    assert.ok(generatorColors({ type: 'gradient', params: { stops: 8 } }).length <= 4);
    assert.deepEqual(generatorColors({ type: 'no-such', params: {} }), []);
    assert.deepEqual(generatorColors({ type: '' }), []);
    const same = { type: 'solid', params: {} };
    assert.equal(generatorColors(same), generatorColors(same), 'remembered per generator');
    assert.equal(generatorLabel({ type: 'gradient' }), 'Gradient');
    assert.equal(generatorLabel({ type: 'mystery' }), 'mystery');
  });

  it('knows a clip with effects that are on, and a track composited on its own', () => {
    let edl = addEffect(keyed(), 't', 'blur', { enabled: false });
    assert.equal(hasActiveEffects(clipOf(edl, 't')), false);
    edl = addEffect(edl, 't', 'glow');
    assert.equal(hasActiveEffects(clipOf(edl, 't')), true);
    const track = { type: 'video', opacity: 1, blendMode: 'normal', effects: [] };
    assert.equal(trackIsProcessed(track), false);
    assert.equal(trackIsProcessed({ ...track, opacity: 0.5 }), true);
    assert.equal(trackIsProcessed({ ...track, blendMode: 'screen' }), true);
    assert.equal(trackIsProcessed({ ...track, effects: [{ type: 'blur', enabled: true }] }), true);
    assert.equal(trackIsProcessed({ ...track, type: 'audio', opacity: 0.5 }), false);
  });

  it('marks keyframes at their timeline times, merging those too close to tell apart', () => {
    const clip = clipOf(keyed(), 't');
    assert.deepEqual(keyMarks(clip, 100), [3, 3.1, 6], 'inside the clip only');
    assert.deepEqual(keyMarks(clip, 20), [3, 6], '0.1 s is 2 px here: one mark');
    assert.deepEqual(keyMarks(clip, 2), [], 'a 20 px clip shows none');
    assert.deepEqual(keyMarks(testClip('v', 0, 5), 100), []);
    assert.equal(keyMarkAt(clip, 6.04, 100, 7), 6);
    assert.equal(keyMarkAt(clip, 6.2, 100, 7), null);
    assert.equal(keyMarkAt(clip, 3.06, 100, 7), 3.1, 'the nearer of two');
  });

  it('stays attached through a trim: marks are timeline times', () => {
    const edl = keyed();
    const trimmed = { ...clipOf(edl, 't'), timelineStart: 4, sourceIn: 2 };
    assert.deepEqual(keyMarks(trimmed, 100), [6]);
  });
});

describe('keyframe marks on the timeline', () => {
  const edl = keyed();
  const vp = { width: 1200, height: 300, pps: 100, scrollX: 0, scrollY: 0 };
  const lanes = layoutLanes(edl.tracks);
  const geo = { vp, lanes, doc: edl };
  const lane = lanes[0];
  const top = RULER_H + lane.top;
  const bottom = top + lane.height - 8;

  it('hits a mark along the bottom of the clip, and the clip body elsewhere', () => {
    const hit = hitTest(geo, timeToX(vp, 6) + 2, bottom);
    assert.deepEqual([hit.clipId, hit.part, hit.keyTime], ['t', 'keyframe', 6]);
    assert.equal(hitTest(geo, timeToX(vp, 6) + 2, top + 25).part, 'body', 'higher up');
    assert.equal(hitTest(geo, timeToX(vp, 8), bottom).part, 'body', 'between marks');
    assert.equal(chooseGesture(hit), 'keyframe');
    assert.equal(cursorFor(hit), 'pointer');
  });

  it('retimes every key at the mark, on the frame grid and inside the clip', () => {
    const moved = keyframePreview(edl, 't', 3, 4.013);
    assert.equal(moved.time, 4);
    assert.deepEqual(
      clipOf(moved.doc, 't').keyframes['transform.x'].map((key) => key.t + 2),
      [4, 6, 20],
    );
    assert.equal(keyframePreview(edl, 't', 6, 50).time, 12, 'stops at the clip end');
    assert.equal(keyframePreview(edl, 't', 6, -3).time, 2);
    assert.equal(keyframePreview(edl, 'nope', 6, 7).doc, edl);
  });
});
