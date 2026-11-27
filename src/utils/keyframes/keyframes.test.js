import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insertGenerator } from '#utils/edl/generator.js';
import { addEffect } from '#utils/edl/effects.js';
import { createClip } from '#utils/edl/factory.js';
import { setKeyframe } from '#utils/edl/keyframes.js';
import { assertValid, clipOf, deepFreeze, testEdl } from '#utils/edl/testkit.js';
import { addKeys, easeKeys, removeKeys, stopAnimation, toggleKey } from './actions.js';
import { pathLabel, humanize } from './labels.js';
import { keyframeState, stepTime } from './state.js';
import { currentValue, defaultValue } from './values.js';

const title = () =>
  createClip({ clipId: 't', timelineStart: 2, timelineEnd: 8, text: { content: 'Hi' } });
const doc = () => deepFreeze(testEdl({ v1: [title()] }));
const POSITION = ['transform.x', 'transform.y'];

describe('keyframeState', () => {
  it('is "none" for a property without keys', () => {
    const state = keyframeState([clipOf(doc(), 't')], POSITION, 3, 30);
    assert.deepEqual(state, {
      state: 'none',
      hasPrevious: false,
      hasNext: false,
      current: null,
      ease: '',
    });
  });

  it('tells a key under the playhead from a time between keys', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 3, 100, { ease: 'ease-out' });
    edl = setKeyframe(edl, 't', 'transform.x', 5, 300);
    const at = (time) => keyframeState([clipOf(edl, 't')], POSITION, time, 30);
    assert.equal(at(3).state, 'key');
    assert.equal(at(3 + 0.4 / 30).state, 'key', 'within half a frame');
    assert.equal(at(4).state, 'between');
    assert.deepEqual(
      [at(2.5).hasPrevious, at(2.5).hasNext, at(4).hasPrevious, at(4).hasNext, at(6).hasNext],
      [false, true, true, true, false],
    );
    assert.equal(at(4).current, 3, 'the segment under the playhead leaves the key before it');
    assert.equal(at(4).ease, 'ease-out');
    assert.equal(at(2.5).current, null);
    assert.equal(at(5).ease, 'linear');
  });

  it('steps to the nearest key of any driven path, inside the clip only', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 3, 1);
    edl = setKeyframe(edl, 't', 'transform.y', 4, 1);
    edl = setKeyframe(edl, 't', 'transform.y', 9, 1); // trimmed away: after the clip
    const clips = [clipOf(edl, 't')];
    assert.equal(stepTime(clips, POSITION, 2, 1), 3);
    assert.equal(stepTime(clips, POSITION, 3, 1), 4);
    assert.equal(stepTime(clips, POSITION, 4, 1), null);
    assert.equal(stepTime(clips, POSITION, 4, -1), 3);
    assert.equal(stepTime(clips, ['transform.x'], 3, -1), null);
  });
});

describe('keyframe actions', () => {
  it('adds keys for every path with the value under the playhead', () => {
    const edl = assertValid(addKeys(doc(), ['t'], POSITION, 3));
    const clip = clipOf(edl, 't');
    assert.deepEqual(clip.keyframes['transform.x'], [{ t: 1, v: 0, ease: 'linear' }]);
    assert.deepEqual(clip.keyframes['transform.y'], [{ t: 1, v: 0, ease: 'linear' }]);
  });

  it('a second key holds the animated value at that moment', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 2, 0);
    edl = setKeyframe(edl, 't', 'transform.x', 4, 200);
    edl = addKeys(edl, ['t'], ['transform.x'], 3);
    assert.deepEqual(
      clipOf(edl, 't').keyframes['transform.x'].map((key) => key.v),
      [0, 100, 200],
    );
  });

  it('toggles the key under the playhead and keeps keys inside the clip', () => {
    const added = toggleKey(doc(), ['t'], POSITION, 3);
    assert.equal(keyframeState([clipOf(added, 't')], POSITION, 3, 30).state, 'key');
    const removed = toggleKey(added, ['t'], POSITION, 3);
    assert.deepEqual(clipOf(removed, 't').keyframes, {});
    const early = toggleKey(doc(), ['t'], ['transform.x'], 0);
    assert.equal(clipOf(early, 't').keyframes['transform.x'][0].t, 0, 'at the clip start');
    assert.deepEqual(toggleKey(early, ['t'], ['transform.x'], 0), doc());
  });

  it('removing the last key leaves the value; stopping keeps the value at the playhead', () => {
    let edl = setKeyframe(doc(), 't', 'transform.x', 2, 0);
    edl = setKeyframe(edl, 't', 'transform.x', 4, 200);
    const stopped = assertValid(stopAnimation(edl, ['t'], POSITION, 3));
    assert.equal(clipOf(stopped, 't').transform.x, 100);
    assert.deepEqual(clipOf(stopped, 't').keyframes, {});
    const one = removeKeys(edl, ['t'], POSITION, 2);
    assert.equal(clipOf(one, 't').keyframes['transform.x'].length, 1);
  });

  it('sets the easing of the keys at a time', () => {
    const edl = easeKeys(addKeys(doc(), ['t'], POSITION, 3), ['t'], POSITION, 3, 'back-out');
    assert.equal(clipOf(edl, 't').keyframes['transform.x'][0].ease, 'back-out');
    assert.equal(clipOf(edl, 't').keyframes['transform.y'][0].ease, 'back-out');
  });

  it('keys a parameter that is not stored from its catalog default', () => {
    let edl = insertGenerator(testEdl(), { type: 'gradient', seed: 1 }, { time: 0, duration: 4 });
    const id = edl.tracks[0].clips[0].clipId;
    edl = addEffect(edl, id, 'blur', { effectId: 'fx_a' });
    const clip = clipOf(edl, id);
    assert.equal(defaultValue(clip, 'generator.params.angle'), 90);
    assert.equal(defaultValue(clip, 'generator.params.center.x'), 0.5);
    assert.equal(defaultValue(clip, 'effects.fx_a.radius'), 8);
    assert.equal(defaultValue(clip, 'transform.x'), undefined);
    assert.equal(currentValue(clip, 'effects.fx_a.radius', 1), 8);
    const paths = ['generator.params.center.x', 'generator.params.center.y'];
    const keyed = assertValid(addKeys(edl, [id], [...paths, 'effects.fx_a.radius'], 1));
    assert.deepEqual(clipOf(keyed, id).keyframes, {
      'generator.params.center.x': [{ t: 1, v: 0.5, ease: 'linear' }],
      'generator.params.center.y': [{ t: 1, v: 0.5, ease: 'linear' }],
      'effects.fx_a.radius': [{ t: 1, v: 8, ease: 'linear' }],
    });
  });
});

describe('pathLabel', () => {
  it('names fixed fields, generator parameters and effect parameters', () => {
    let edl = insertGenerator(testEdl(), { type: 'gradient', seed: 1 }, { time: 0 });
    const id = edl.tracks[0].clips[0].clipId;
    edl = addEffect(edl, id, 'blur', { effectId: 'fx_a' });
    const clip = clipOf(edl, id);
    assert.equal(pathLabel(clip, 'transform.x'), 'Position X');
    assert.equal(pathLabel(clip, 'volume'), 'Volume');
    assert.equal(pathLabel(clip, 'generator.params.angle'), 'Gradient · Angle');
    assert.equal(pathLabel(clip, 'generator.params.center.x'), 'Gradient · Centre X');
    assert.equal(pathLabel(clip, 'generator.seed'), 'Gradient · Seed');
    assert.equal(pathLabel(clip, 'effects.fx_a.radius'), 'Blur · Radius');
    assert.equal(pathLabel(clip, 'effects.gone.amount'), 'Effect · Amount');
    assert.equal(pathLabel(clip, 'transform.anchorX'), 'Anchor x');
    assert.equal(humanize('strokeWidth'), 'Stroke width');
    assert.equal(humanize('soft-light'), 'Soft light');
    assert.equal(humanize('color2'), 'Color 2');
  });
});
