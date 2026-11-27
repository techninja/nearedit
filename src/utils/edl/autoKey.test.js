import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

/** A generator at 10–16 (source window from 4) with one effect, and a plain video clip. */
const doc = () =>
  deepFreeze(
    assertValid(
      testEdl({
        v1: [
          testClip('g', 10, 16, {
            sourceFile: '',
            sourceIn: 4,
            sourceOut: 10,
            generator: { type: 'shape', seed: 1, params: { sides: 5, center: { x: 0.5, y: 0.5 } } },
            effects: [{ effectId: 'fx', type: 'blur', enabled: true, params: { radius: 6 } }],
            transform: { x: 50 },
            text: { content: '' },
          }),
          testClip('v', 20, 24),
        ],
      }),
    ),
  );
const ok = (edl) => {
  assertValid(edl);
  assert.deepEqual(E.normalizeEdl(edl), edl, 'normalising the result changes nothing');
  return edl;
};
const g = (edl) => clipOf(edl, 'g');

describe('setValueAt — the inspector’s auto-key', () => {
  it('writes the plain value while a property is not animated', () => {
    let out = ok(E.setValueAt(doc(), 'g', 'transform.x', 120, 12));
    assert.deepEqual([g(out).transform.x, g(out).keyframes], [120, {}]);
    out = ok(E.setValueAt(out, 'g', 'transform.opacity', 9));
    out = ok(E.setValueAt(out, 'g', 'text.content', 'Now a label'));
    out = ok(E.setValueAt(out, 'g', 'blendMode', 'add'));
    out = ok(E.setValueAt(out, 'g', 'volume', '0.25'));
    const clip = g(out);
    assert.deepEqual(
      [clip.transform.opacity, clip.text.content, clip.blendMode, clip.volume],
      [1, 'Now a label', 'add', 0.25],
    );
    assert.equal(E.setValueAt(out, 'g', 'blendMode', 'dodge'), out, 'unknown enum: no change');
    assert.equal(E.setValueAt(out, 'g', 'timelineStart', 3), out, 'timing is not writable');
    assert.equal(E.setValueAt(out, 'g', 'linkedClipId', 'v'), out);
    assert.equal(E.setValueAt(out, 'g', 'transform.x', 120), out, 'same value, same document');
  });

  it('writes free-form parameters of any JSON-safe type, nested ones without losing siblings', () => {
    let out = ok(E.setValueAt(doc(), 'g', 'generator.params.sides', 7));
    out = ok(E.setValueAt(out, 'g', 'generator.params.style', 'outline'));
    out = ok(E.setValueAt(out, 'g', 'generator.params.center.x', 0.2));
    out = ok(E.setValueAt(out, 'g', 'generator.params.fill', { from: '#000000', stops: [0, 1] }));
    out = ok(E.setValueAt(out, 'g', 'effects.fx.radius', 20));
    out = ok(E.setValueAt(out, 'g', 'effects.fx.quality', 'high'));
    out = ok(E.setValueAt(out, 'g', 'effects.fx.offset.y', 3));
    assert.deepEqual(g(out).generator.params, {
      sides: 7,
      center: { x: 0.2, y: 0.5 },
      style: 'outline',
      fill: { from: '#000000', stops: [0, 1] },
    });
    assert.deepEqual(g(out).effects[0].params, { radius: 20, quality: 'high', offset: { y: 3 } });
    const reset = ok(E.setValueAt(out, 'g', 'generator.params.style', null));
    assert.equal('style' in g(reset).generator.params, false, 'null: back to the default');
    assert.equal(E.setValueAt(out, 'g', 'effects.nope.radius', 1), out);
    assert.equal(
      E.setValueAt(out, 'g', 'generator.params.sides', () => 1),
      out,
    );
    assert.equal(E.setValueAt(out, 'g', 'generator.params.__proto__.x', 1), out);
  });

  it('writes a key at the time once the property is animated', () => {
    const animated = E.setAnimated(doc(), 'g', 'transform.x', true, 11);
    const out = ok(E.setValueAt(animated, 'g', 'transform.x', 300, 14));
    assert.deepEqual(g(out).keyframes['transform.x'], [
      { t: 5, v: 50, ease: 'linear' },
      { t: 8, v: 300, ease: 'linear' },
    ]);
    assert.equal(g(out).transform.x, 50, 'the plain value stays as it was');
    const replaced = ok(E.setValueAt(out, 'g', 'transform.x', 80, 11));
    assert.equal(g(replaced).keyframes['transform.x'][0].v, 80);
    assert.equal(
      E.setValueAt(out, 'g', 'transform.x', 80),
      out,
      'an animated property needs a time',
    );
    assert.equal(E.setValueAt(out, 'g', 'transform.x', 'x', 12), out);
    const locked = deepFreeze(E.toggleTrackLock(out, 'v1'));
    assert.equal(E.setValueAt(locked, 'g', 'transform.x', 1, 12), locked);
  });
});

describe('setAnimated', () => {
  it('on: the first key takes the current value at that time', () => {
    const out = ok(E.setAnimated(doc(), 'g', 'transform.x', true, 12));
    assert.deepEqual(g(out).keyframes, { 'transform.x': [{ t: 6, v: 50, ease: 'linear' }] });
    assert.equal(E.setAnimated(out, 'g', 'transform.x', true, 13), out, 'already animated');
    const atStart = E.setAnimated(doc(), 'g', 'effects.fx.radius', true);
    assert.deepEqual(g(atStart).keyframes['effects.fx.radius'], [{ t: 4, v: 6, ease: 'linear' }]);
  });

  it('on: a parameter that is not stored needs its value passed in', () => {
    const start = doc();
    assert.equal(E.setAnimated(start, 'g', 'generator.params.spin', true, 12), start);
    const out = ok(E.setAnimated(start, 'g', 'generator.params.spin', true, 12, { value: 90 }));
    assert.deepEqual(g(out).keyframes['generator.params.spin'], [{ t: 6, v: 90, ease: 'linear' }]);
    assert.equal(E.setAnimated(start, 'g', 'text.content', true, 12), start, 'not animatable');
  });

  it('off: the keys go and the property keeps the value it has at that time', () => {
    let out = E.setAnimated(doc(), 'g', 'transform.x', true, 10);
    out = E.setKeyframe(out, 'g', 'transform.x', 14, 450);
    const frozen = ok(E.setAnimated(out, 'g', 'transform.x', false, 12));
    assert.deepEqual([g(frozen).keyframes, g(frozen).transform.x], [{}, 250]);
    const atStart = ok(E.setAnimated(out, 'g', 'transform.x', false));
    assert.equal(g(atStart).transform.x, 50);
    let fx = E.setKeyframe(doc(), 'g', 'effects.fx.radius', 10, 40);
    fx = ok(E.setAnimated(fx, 'g', 'effects.fx.radius', false, 10));
    assert.deepEqual([g(fx).keyframes, g(fx).effects[0].params.radius], [{}, 40]);
    const start = doc();
    assert.equal(E.setAnimated(start, 'g', 'transform.x', false, 12), start, 'nothing to turn off');
  });
});

describe('keyframe queries', () => {
  const keyed = () => {
    let out = doc();
    out = E.setKeyframe(out, 'g', 'transform.x', 11, 0);
    out = E.setKeyframe(out, 'g', 'transform.x', 15, 9, { ease: 'hold' });
    out = E.setKeyframe(out, 'g', 'effects.fx.radius', 11, 1);
    out = E.setKeyframe(out, 'g', 'effects.fx.radius', 13, 2);
    out = E.setKeyframe(out, 'v', 'transform.rotation', 22, 90);
    return deepFreeze(E.trimClipEnd(out, 'g', 14));
  };

  it('isAnimated, animatedPaths and keyTime', () => {
    const clip = g(keyed());
    assert.deepEqual(
      [E.isAnimated(clip, 'transform.x'), E.isAnimated(clip, 'volume')],
      [true, false],
    );
    assert.deepEqual(E.animatedPaths(clip), ['transform.x', 'effects.fx.radius']);
    assert.equal(E.keyTime(clip, 5), 11);
    assert.deepEqual([E.isAnimated(undefined, 'x'), E.animatedPaths({})], [false, []]);
  });

  it('listKeyframes gives every key with its timeline time; keys trimmed away are marked', () => {
    const list = E.listKeyframes(g(keyed()));
    assert.deepEqual(
      list.map((k) => [k.path, k.index, k.time, k.t, k.v, k.ease, k.inside]),
      [
        ['transform.x', 0, 11, 5, 0, 'linear', true],
        ['effects.fx.radius', 0, 11, 5, 1, 'linear', true],
        ['effects.fx.radius', 1, 13, 7, 2, 'linear', true],
        ['transform.x', 1, 15, 9, 9, 'hold', false],
      ],
    );
    assert.equal(E.listKeyframes(g(keyed()), 'transform.x').length, 2);
    assert.deepEqual(E.listKeyframes(g(keyed()), 'volume'), []);
  });

  it('keyframeTimes merges the keys of a clip (or several) into distinct timeline times', () => {
    const edl = keyed();
    assert.deepEqual(E.keyframeTimes(g(edl)), [11, 13]);
    assert.deepEqual(E.keyframeTimes(g(edl), { within: false }), [11, 13, 15]);
    assert.deepEqual(E.keyframeTimes(g(edl), { path: 'transform.x' }), [11]);
    assert.deepEqual(E.keyframeTimes([g(edl), clipOf(edl, 'v')]), [11, 13, 22]);
    assert.deepEqual(E.keyframeTimes(clipOf(edl, 'v')), [22]);
    assert.deepEqual(E.keyframeTimes([]), []);
  });

  it('steps to the next and previous key from a time', () => {
    const clips = [g(keyed()), clipOf(keyed(), 'v')];
    assert.deepEqual(
      [0, 11, 12.99, 13, 22].map((time) => E.nextKeyframeTime(clips, time)),
      [11, 13, 13, 22, null],
    );
    assert.deepEqual(
      [30, 22, 13.01, 13, 11].map((time) => E.previousKeyframeTime(clips, time)),
      [22, 13, 13, 11, null],
    );
    assert.equal(E.nextKeyframeTime(clips[0], 13, { within: false }), 15);
    assert.equal(E.previousKeyframeTime(clips[0], 13, { path: 'transform.x' }), 11);
  });
});
