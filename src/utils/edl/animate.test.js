import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EASINGS,
  clipLocalTime,
  ease,
  getPath,
  isColor,
  lerpColor,
  resolveClip,
  setPath,
  valueAt,
} from './animate.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('easing', () => {
  it('every curve starts at 0 and ends at 1', () => {
    for (const name of EASINGS) {
      near(ease(name, 0), 0);
      near(ease(name, 1), 1);
    }
  });

  it('clamps progress and falls back to linear for an unknown name', () => {
    assert.equal(ease('linear', -2), 0);
    assert.equal(ease('linear', 5), 1);
    assert.equal(ease('no-such-curve', 0.25), 0.25);
    assert.equal(ease(undefined, 0.25), 0.25);
  });

  it('hold jumps only at the end; ease-out is ahead of linear; back-out overshoots', () => {
    assert.equal(ease('hold', 0.999), 0);
    assert.ok(ease('ease-out', 0.5) > 0.5 && ease('ease-in', 0.5) < 0.5);
    near(ease('ease-in-out', 0.5), 0.5);
    assert.ok(ease('back-out', 0.6) > 1);
  });
});

describe('valueAt', () => {
  const keys = [
    { t: 1, v: 10 },
    { t: 3, v: 30, ease: 'hold' },
    { t: 5, v: 0 },
  ];

  it('holds the first value before and the last value after', () => {
    assert.equal(valueAt(keys, 0), 10);
    assert.equal(valueAt(keys, 9), 0);
    assert.equal(valueAt([], 1), undefined);
    assert.equal(valueAt(undefined, 1), undefined);
  });

  it('interpolates with the easing of the key it leaves', () => {
    assert.equal(valueAt(keys, 2), 20);
    assert.equal(valueAt(keys, 3), 30);
    assert.equal(valueAt(keys, 4.9), 30, 'hold keeps the value until the next key');
    assert.equal(valueAt(keys, 5), 0);
    assert.equal(
      valueAt(
        [
          { t: 0, v: 0, ease: 'ease-out' },
          { t: 2, v: 100 },
        ],
        1,
      ),
      87.5,
    );
  });

  it('blends colours and switches other values at the next key', () => {
    const colours = [
      { t: 0, v: '#000000' },
      { t: 1, v: '#ff8000' },
    ];
    assert.equal(valueAt(colours, 0.5), '#804000');
    assert.equal(lerpColor('#ff0000', '#0000ff80', 0.5), '#800080c0');
    assert.ok(isColor('#A1b2C3') && isColor('#a1b2c3d4') && !isColor('#abc') && !isColor('red'));
    const words = [
      { t: 0, v: 'left' },
      { t: 1, v: 'right' },
    ];
    assert.deepEqual([valueAt(words, 0.99), valueAt(words, 1)], ['left', 'right']);
  });
});

describe('paths', () => {
  const clip = {
    transform: { x: 1, kenBurns: { enabled: false } },
    generator: { type: 'gradient', params: { angle: 0 } },
    effects: [
      { effectId: 'a', type: 'blur', params: { radius: 4 } },
      { effectId: 'b', type: 'glow', params: { radius: 9 } },
    ],
  };

  it('reads dotted paths and effect parameters by effect id', () => {
    assert.equal(getPath(clip, 'transform.x'), 1);
    assert.equal(getPath(clip, 'generator.params.angle'), 0);
    assert.equal(getPath(clip, 'effects.b.radius'), 9);
    assert.equal(getPath(clip, 'effects.zz.radius'), undefined);
    assert.equal(getPath(clip, 'text.fontSize'), undefined);
  });

  it('sets without mutating and keeps untouched branches', () => {
    const frozen = structuredClone(clip);
    const moved = setPath(clip, 'transform.x', 50);
    const blurred = setPath(clip, 'effects.a.radius', 20);
    assert.deepEqual(clip, frozen);
    assert.equal(moved.transform.x, 50);
    assert.equal(moved.generator, clip.generator, 'other branches keep their identity');
    assert.deepEqual([blurred.effects[0].params.radius, blurred.effects[1]], [20, clip.effects[1]]);
    assert.equal(setPath({}, 'text.fontSize', 9).text.fontSize, 9, 'creates missing branches');
  });
});

describe('resolveClip', () => {
  const clip = {
    sourceIn: 2,
    timelineStart: 10,
    timelineEnd: 14,
    transform: { x: 0, opacity: 1 },
    effects: [{ effectId: 'fx', type: 'blur', params: { radius: 0 } }],
    keyframes: {
      'transform.x': [
        { t: 2, v: 0 },
        { t: 4, v: 200 },
      ],
      'effects.fx.radius': [
        { t: 0, v: 40 },
        { t: 4, v: 0 },
      ],
    },
  };

  it('uses clip-local source time, so keys follow the content', () => {
    assert.equal(clipLocalTime(clip, 11), 3);
    const at = resolveClip(clip, 11);
    assert.equal(at.transform.x, 100);
    assert.equal(at.effects[0].params.radius, 10);
    assert.equal(at.transform.opacity, 1);
    // Slipping the clip 1 s later in its source moves the animation with it.
    assert.equal(resolveClip({ ...clip, sourceIn: 3 }, 11).transform.x, 200);
    // The second half of a split keeps the same keys and renders the same.
    const second = { ...clip, sourceIn: 3, timelineStart: 11 };
    assert.equal(resolveClip(second, 11.5).transform.x, resolveClip(clip, 11.5).transform.x);
  });

  it('returns the same object when nothing is animated', () => {
    const plain = { timelineStart: 0, transform: { x: 3 } };
    assert.equal(resolveClip(plain, 5), plain);
    assert.equal(resolveClip({ ...plain, keyframes: {} }, 5).transform.x, 3);
  });
});
