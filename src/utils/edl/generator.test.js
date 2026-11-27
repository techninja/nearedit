import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const doc = () => deepFreeze(assertValid(testEdl({ v2: [], v1: [testClip('a', 0, 10)], a1: [] })));
const ok = (edl) => {
  assertValid(edl);
  assert.deepEqual(E.normalizeEdl(edl), edl, 'normalising the result changes nothing');
  return edl;
};
const created = (before, after) => E.newClipIds(before, after).map((id) => clipOf(after, id));
const gradient = { type: 'gradient', seed: 9, params: { angle: 30, from: '#111111' } };

describe('insertGenerator', () => {
  it('adds a generator clip with a source window that starts at 0', () => {
    const start = doc();
    const out = ok(E.insertGenerator(start, gradient, { time: 2.01, duration: 3 }));
    const [clip] = created(start, out);
    assert.equal(E.clipKind(clip, out.tracks[0]), 'generator');
    assert.deepEqual(clip.generator, gradient);
    assert.notEqual(clip.generator.params, gradient.params, 'parameters are copied');
    assert.deepEqual(
      [clip.timelineStart, clip.timelineEnd, clip.sourceIn, clip.sourceOut],
      [2, 5, 0, 3],
    );
    assert.deepEqual([clip.label, clip.sourceFile, clip.text.content], ['gradient', '', '']);
  });

  it('is placed like a title: front track when free, else a new track on top, or where asked', () => {
    const start = doc();
    const free = ok(E.insertGenerator(start, gradient, { time: 1, duration: 2 }));
    assert.equal(free.tracks[0].trackId, 'v2', 'the front-most track was free');
    assert.equal(free.tracks[0].clips.length, 1);
    const busy = ok(E.insertGenerator(free, gradient, { time: 2, duration: 2 }));
    assert.equal(busy.tracks.length, free.tracks.length + 1, 'a new track on top');
    assert.equal(busy.tracks[0].clips.length, 1);
    const asked = ok(
      E.insertGenerator(start, gradient, {
        time: 4,
        duration: 2,
        trackId: 'v1',
        autoCrossfade: false,
      }),
    );
    assert.deepEqual(
      layout(asked).v1.map((c) => c.split(' ')[1]),
      ['0-4', '4-6', '6-10'],
    );
    const locked = deepFreeze(E.toggleTrackLock(start, 'v2'));
    const above = ok(E.insertGenerator(locked, gradient, {}));
    assert.equal(above.tracks.length, locked.tracks.length + 1);
    assert.deepEqual(
      created(locked, above).map((c) => [c.timelineStart, c.timelineEnd]),
      [[0, 5]],
    );
  });

  it('cleans parameters, draws a seed when none is given, and refuses a missing type', () => {
    const start = doc();
    const out = ok(E.insertGenerator(start, { type: 'noise', params: { scale: 2, f: () => 1 } }));
    const [clip] = created(start, out);
    assert.deepEqual(clip.generator.params, { scale: 2 });
    assert.ok(Number.isInteger(clip.generator.seed) && clip.generator.seed >= 0);
    assert.equal(E.insertGenerator(start, { type: '' }), start);
    assert.equal(E.insertGenerator(start, null), start);
    assert.equal(E.insertGenerator(start, { params: {} }), start);
  });

  it('takes a clip patch for the look: blend mode, effects, keyframes, label', () => {
    const start = doc();
    const out = ok(
      E.insertGenerator(
        start,
        { type: 'particles', seed: 1 },
        {
          time: 3,
          duration: 4,
          label: 'Sparks',
          clip: {
            blendMode: 'add',
            fadeOutCurve: 'smooth',
            transform: { opacity: 0.8 },
            effects: [{ effectId: 'g', type: 'glow' }],
            keyframes: {
              'generator.params.rate': [
                { t: 0, v: 0 },
                { t: 1, v: 200 },
              ],
              'effects.g.radius': [{ t: 0, v: 9 }],
              'effects.other.radius': [{ t: 0, v: 9 }],
            },
            timelineStart: 99,
            sourceIn: 50,
            clipId: 'chosen',
          },
        },
      ),
    );
    const [clip] = created(start, out);
    assert.deepEqual(
      [clip.label, clip.blendMode, clip.fadeOutCurve, clip.transform.opacity],
      ['Sparks', 'add', 'smooth', 0.8],
    );
    assert.deepEqual(Object.keys(clip.keyframes), ['generator.params.rate', 'effects.g.radius']);
    assert.deepEqual(
      [clip.timelineStart, clip.sourceIn, clip.sourceOut],
      [3, 0, 4],
      'timing is the insert’s',
    );
    assert.notEqual(clip.clipId, 'chosen');
    assert.equal(E.resolveClip(clip, 3.5).generator.params.rate, 100);
  });
});

describe('updateGenerator', () => {
  const withGen = () => {
    const out = E.insertGenerator(doc(), gradient, { duration: 4, clip: { clipId: 'x' } });
    const id = E.newClipIds(doc(), out)[0];
    let keyed = E.setKeyframe(out, id, 'generator.params.angle', 1, 90);
    keyed = E.setKeyframe(keyed, id, 'transform.x', 1, 5);
    return { edl: deepFreeze(keyed), id };
  };

  it('merges parameters (null removes) and sets the seed', () => {
    const { edl, id } = withGen();
    const out = ok(
      E.updateGenerator(edl, id, { params: { angle: 60, from: null, to: '#ffffff' }, seed: 4 }),
    );
    assert.deepEqual(clipOf(out, id).generator, {
      type: 'gradient',
      seed: 4,
      params: { angle: 60, to: '#ffffff' },
    });
    assert.equal(clipOf(out, id).keyframes, clipOf(edl, id).keyframes);
    assert.equal(E.updateGenerator(edl, id, { params: { angle: 30 }, seed: 9 }), edl);
    assert.equal(E.updateGenerator(edl, id, null), edl);
    assert.equal(ok(E.updateGenerator(edl, id, { seed: -3 })).tracks[0].clips[0].generator.seed, 0);
  });

  it('switching the type starts from its defaults and drops the old parameter keyframes', () => {
    const { edl, id } = withGen();
    const out = ok(E.updateGenerator(edl, id, { type: 'solid', params: { color: '#ff0000' } }));
    assert.deepEqual(clipOf(out, id).generator, {
      type: 'solid',
      seed: 9,
      params: { color: '#ff0000' },
    });
    assert.deepEqual(Object.keys(clipOf(out, id).keyframes), ['transform.x']);
    const cleared = ok(E.updateGenerator(edl, id, { type: '' }));
    assert.equal(E.clipKind(clipOf(cleared, id)), 'placeholder');
    assert.deepEqual(Object.keys(clipOf(cleared, id).keyframes), ['transform.x']);
    const viaUpdateClip = ok(E.updateClip(edl, id, { generator: { type: '' } }));
    assert.deepEqual(
      Object.keys(clipOf(viaUpdateClip, id).keyframes),
      ['transform.x'],
      'tidied too',
    );
  });

  it('turns any clip into a generator, and respects locks', () => {
    const start = doc();
    const out = ok(E.updateGenerator(start, 'a', { type: 'noise' }));
    assert.equal(E.clipKind(clipOf(out, 'a'), out.tracks[1]), 'generator');
    assert.equal(E.isTimed(clipOf(out, 'a'), out.tracks[1]), false);
    const slipped = ok(E.slipClip(out, 'a', -3));
    assert.equal(clipOf(slipped, 'a').sourceIn, -3, 'its source is unbounded now');
    const back = ok(E.updateClip(slipped, 'a', { generator: { type: '' } }));
    assert.deepEqual(
      [clipOf(back, 'a').sourceIn, clipOf(back, 'a').sourceOut],
      [0, 10],
      'media again: inside its source',
    );
    const locked = deepFreeze(E.toggleTrackLock(start, 'v1'));
    assert.equal(E.updateGenerator(locked, 'a', { type: 'noise' }), locked);
  });
});

describe('blend mode and fade curves through updateClip', () => {
  it('sets known values, ignores unknown ones, leaves fade lengths to setClipFades', () => {
    const start = doc();
    const out = ok(
      E.updateClip(start, 'a', {
        blendMode: 'overlay',
        fadeInCurve: 'fast',
        fadeOutCurve: 'slow',
        fadeIn: 3,
      }),
    );
    const clip = clipOf(out, 'a');
    assert.deepEqual(
      [clip.blendMode, clip.fadeInCurve, clip.fadeOutCurve, clip.fadeIn],
      ['overlay', 'fast', 'slow', 0],
    );
    assert.equal(E.updateClip(start, 'a', { blendMode: 'dodge', fadeInCurve: 'bouncy' }), start);
    const faded = ok(E.setClipFades(out, 'a', { fadeIn: 2 }));
    assert.deepEqual([clipOf(faded, 'a').fadeIn, clipOf(faded, 'a').fadeInCurve], [2, 'fast']);
  });
});
