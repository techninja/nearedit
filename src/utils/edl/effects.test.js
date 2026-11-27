import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { MAX_EFFECTS } from './effectList.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const doc = () =>
  deepFreeze(
    assertValid(
      testEdl({
        v2: [testClip('x', 0, 4)],
        v1: [testClip('c', 0, 4, { linkedClipId: 'c_a' })],
        a1: [testClip('c_a', 0, 4, { linkedClipId: 'c' })],
      }),
    ),
  );
const CLIP = { clipId: 'c' };
const TRACK = { trackId: 'v1' };
const ok = (edl) => {
  assertValid(edl);
  assert.deepEqual(E.normalizeEdl(edl), edl, 'normalising the result changes nothing');
  return edl;
};
/** A stack as `type` names, or `type:id` pairs when ids matter. */
const stack = (edl, target) => E.effectsOf(edl, target).map((fx) => fx.type);
const three = (target) => {
  let out = E.addEffect(doc(), target, 'blur', { effectId: 'one', params: { radius: 8 } });
  out = E.addEffect(out, target, 'glow', { effectId: 'two' });
  return deepFreeze(E.addEffect(out, target, 'tint', { effectId: 'three', enabled: false }));
};

for (const [name, target] of [
  ['clip', CLIP],
  ['track', TRACK],
]) {
  describe(`effects on a ${name}`, () => {
    it('addEffect appends with a fresh id, or inserts at an index with a chosen id', () => {
      const one = ok(E.addEffect(doc(), target, 'blur', { params: { radius: 8, bad: NaN } }));
      const [fx] = E.effectsOf(one, target);
      assert.match(fx.effectId, /^fx_/);
      assert.deepEqual([fx.type, fx.enabled, fx.params], ['blur', true, { radius: 8 }]);
      const two = ok(E.addEffect(one, target, 'glow', { index: 0, effectId: 'mine' }));
      assert.deepEqual(stack(two, target), ['glow', 'blur']);
      assert.equal(E.effectsOf(two, target)[0].effectId, 'mine');
      const clash = ok(E.addEffect(two, target, 'tint', { effectId: 'mine' }));
      const ids = E.effectsOf(clash, target).map((e) => e.effectId);
      assert.equal(new Set(ids).size, 3, 'a taken id is replaced');
      const start = doc();
      assert.equal(E.addEffect(start, target, ''), start, 'an effect needs a type');
      assert.equal(E.addEffect(start, target, 5), start);
    });

    it('removeEffect, moveEffect and setEffectEnabled', () => {
      const start = three(target);
      assert.deepEqual(stack(ok(E.removeEffect(start, target, 'two')), target), ['blur', 'tint']);
      assert.equal(E.removeEffect(start, target, 'nope'), start);
      assert.deepEqual(stack(ok(E.moveEffect(start, target, 'three', 0)), target), [
        'tint',
        'blur',
        'glow',
      ]);
      assert.deepEqual(stack(ok(E.moveEffect(start, target, 'one', 99)), target), [
        'glow',
        'tint',
        'blur',
      ]);
      assert.equal(E.moveEffect(start, target, 'two', 1), start, 'already there');
      assert.equal(E.moveEffect(start, target, 'nope', 0), start);
      const off = ok(E.setEffectEnabled(start, target, 'one', false));
      assert.deepEqual(
        E.effectsOf(off, target).map((fx) => fx.enabled),
        [false, true, false],
      );
      const toggled = ok(E.setEffectEnabled(start, target, 'three'));
      assert.equal(E.effectsOf(toggled, target)[2].enabled, true, 'no value given: toggles');
      assert.equal(E.setEffectEnabled(start, target, 'one', true), start);
      assert.equal(E.effectsOf(off, target)[1], E.effectsOf(start, target)[1], 'others are shared');
    });

    it('updateEffect merges parameters (null removes), keeps the id through a type change', () => {
      const start = three(target);
      const out = ok(
        E.updateEffect(start, target, 'one', { params: { radius: null, angle: 30, f: () => 1 } }),
      );
      assert.deepEqual(E.effectsOf(out, target)[0].params, { angle: 30 });
      const retyped = ok(
        E.updateEffect(start, target, 'one', { type: 'pixelate', enabled: false }),
      );
      const [fx] = E.effectsOf(retyped, target);
      assert.deepEqual(
        [fx.effectId, fx.type, fx.enabled, fx.params],
        ['one', 'pixelate', false, { radius: 8 }],
      );
      assert.equal(E.updateEffect(start, target, 'one', { params: { radius: 8 } }), start);
      assert.equal(E.updateEffect(start, target, 'nope', { enabled: false }), start);
      assert.equal(E.updateEffect(start, target, 'one', null), start);
    });

    it('holds at most MAX_EFFECTS and never mutates', () => {
      let out = doc();
      for (let i = 0; i < MAX_EFFECTS + 5; i++) out = deepFreeze(E.addEffect(out, target, 'blur'));
      assert.equal(E.effectsOf(ok(out), target).length, MAX_EFFECTS);
    });
  });
}

describe('effects — clips and tracks differ', () => {
  it('a clip on a locked track cannot be changed; the track’s own stack can', () => {
    const locked = deepFreeze(E.toggleTrackLock(three(CLIP), 'v1'));
    assert.equal(E.addEffect(locked, CLIP, 'blur'), locked);
    assert.equal(E.removeEffect(locked, CLIP, 'one'), locked);
    assert.equal(
      E.updateEffect(locked, 'c', 'one', { enabled: false }),
      locked,
      'a bare id is a clip',
    );
    assert.deepEqual(stack(ok(E.addEffect(locked, TRACK, 'vignette')), TRACK), ['vignette']);
  });

  it('removing a clip’s effect takes the keyframes of its parameters with it', () => {
    let out = E.setKeyframe(three(CLIP), 'c', 'effects.one.radius', 1, 20);
    out = E.setKeyframe(out, 'c', 'effects.two.size', 1, 4);
    out = deepFreeze(E.setKeyframe(out, 'c', 'transform.x', 1, 9));
    const removed = ok(E.removeEffect(out, CLIP, 'one'));
    assert.deepEqual(Object.keys(clipOf(removed, 'c').keyframes), [
      'effects.two.size',
      'transform.x',
    ]);
    const replaced = ok(E.updateClip(out, 'c', { effects: [{ effectId: 'two', type: 'glow' }] }));
    assert.deepEqual(Object.keys(clipOf(replaced, 'c').keyframes), [
      'effects.two.size',
      'transform.x',
    ]);
    const reordered = ok(E.moveEffect(out, CLIP, 'one', 2));
    assert.equal(
      clipOf(reordered, 'c').keyframes,
      clipOf(out, 'c').keyframes,
      'order does not matter',
    );
  });

  it('nothing is mirrored to a linked partner or to other targets', () => {
    const out = three(CLIP);
    assert.deepEqual(clipOf(out, 'c_a').effects, []);
    assert.deepEqual(clipOf(out, 'x').effects, []);
    assert.deepEqual(
      out.tracks.map((t) => t.effects.length),
      [0, 0, 0],
    );
    assert.deepEqual(E.effectsOf(out, { clipId: 'nope' }), []);
    assert.deepEqual(E.effectsOf(out, { trackId: 'nope' }), []);
    assert.equal(E.addEffect(out, { trackId: 'nope' }, 'blur'), out);
    assert.equal(E.addEffect(out, {}, 'blur'), out);
  });

  it('track opacity and blend mode: setters, updateTrack, clamping, junk ignored', () => {
    const start = doc();
    let out = ok(E.setTrackOpacity(start, 'v1', 0.4));
    out = ok(E.setTrackBlendMode(out, 'v1', 'screen'));
    assert.deepEqual([out.tracks[1].opacity, out.tracks[1].blendMode], [0.4, 'screen']);
    assert.equal(ok(E.setTrackOpacity(start, 'v1', 7)).tracks[1].opacity, 1);
    assert.equal(E.setTrackBlendMode(start, 'v1', 'dodge'), start);
    assert.equal(E.setTrackOpacity(start, 'v1', 'half'), start);
    const patched = ok(
      E.updateTrack(start, 'v2', { opacity: 0, blendMode: 'add', effects: [{ type: 'grain' }] }),
    );
    assert.deepEqual([patched.tracks[0].opacity, patched.tracks[0].blendMode], [0, 'add']);
    assert.deepEqual(stack(patched, { trackId: 'v2' }), ['grain']);
    assert.equal(patched.tracks[1], start.tracks[1], 'other tracks are shared');
    const locked = E.toggleTrackLock(start, 'v1');
    assert.equal(
      ok(E.setTrackOpacity(locked, 'v1', 0.5)).tracks[1].opacity,
      0.5,
      'a header setting',
    );
  });
});
