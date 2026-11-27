import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { MAX_DEPTH, MAX_NODES, MAX_STRING, cleanBag, mergeBag } from './jsonBag.js';
import { MAX_KEYS, MAX_PATHS } from './keyList.js';
import { MAX_EFFECTS } from './effectList.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

/** A raw document whose one generator clip carries whatever the test puts on it. */
const rawWith = (extra) => ({
  version: 3,
  tracks: [
    {
      trackId: 'v1',
      type: 'video',
      clips: [
        {
          clipId: 'g',
          timelineStart: 0,
          timelineEnd: 4,
          generator: { type: 'noise', seed: 1, params: {} },
          ...extra,
        },
      ],
    },
  ],
});
const normal = (extra) => clipOf(assertValid(E.normalizeEdl(rawWith(extra))), 'g');
const countNodes = (value) =>
  value && typeof value === 'object'
    ? Object.values(value).reduce((sum, child) => sum + countNodes(child), 1)
    : 1;

describe('free-form bags — hostile input', () => {
  it('keeps JSON-safe values and drops everything else', () => {
    const params = cleanBag({
      n: 1.5,
      s: 'text',
      b: false,
      list: [1, 'two', true, null, undefined, NaN, () => 1, Symbol('x'), 4],
      nested: { ok: 1, bad: Infinity, date: new Date(0), map: new Map(), fn() {} },
      big: 10n,
      minusZero: -0,
      nothing: null,
      missing: undefined,
      instance: new (class Thing {
        x = 1;
      })(),
    });
    assert.deepEqual(params, {
      n: 1.5,
      s: 'text',
      b: false,
      list: [1, 'two', true, 4],
      nested: { ok: 1 },
      minusZero: 0,
    });
    assert.ok(Object.is(params.minusZero, 0), '-0 would not survive JSON');
    assert.deepEqual(cleanBag('nope'), {});
    assert.deepEqual(cleanBag([1, 2]), {});
  });

  it('is not fooled by __proto__, constructor or prototype keys', () => {
    const hostile = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}},' +
        '"a": {"__proto__": {"polluted": true}, "b": 1}, "prototype": 1}',
    );
    const params = cleanBag(hostile);
    assert.deepEqual(params, { a: { b: 1 } });
    assert.equal(Object.getPrototypeOf(params), Object.prototype);
    assert.equal(Object.getPrototypeOf(params.a), Object.prototype);
    assert.equal({}.polluted, undefined);
    const clip = normal({ generator: { type: 'noise', params: hostile }, keyframes: hostile });
    assert.deepEqual(clip.generator.params, { a: { b: 1 } });
    assert.deepEqual(clip.keyframes, {});
    assert.equal({}.polluted, undefined);
  });

  it('survives cycles and bounds depth, size and string length', () => {
    const cyclic = { name: 'loop', list: [] };
    cyclic.self = cyclic;
    cyclic.list.push(cyclic, 1);
    assert.deepEqual(cleanBag(cyclic), { name: 'loop', list: [1] });

    let deep = { leaf: true };
    for (let i = 0; i < 50; i++) deep = { deep };
    const depth = (node) => (node && typeof node === 'object' ? 1 + depth(node.deep) : 0);
    assert.equal(depth(cleanBag(deep)), MAX_DEPTH);

    const huge = cleanBag({ a: new Array(1e6).fill(7), b: 'kept?', c: 'x'.repeat(MAX_STRING * 3) });
    assert.ok(countNodes(huge) <= MAX_NODES + 1, `${countNodes(huge)} values`);
    assert.ok(huge.a.length > 100 && huge.a.length < MAX_NODES);
    const long = cleanBag({ c: 'x'.repeat(MAX_STRING * 3) });
    assert.equal(long.c.length, MAX_STRING);
    assert.deepEqual(cleanBag(new Array(1e7)), {}, 'a sparse array is not walked to its end');
  });

  it('normalising hostile parameters gives a valid, stable document', () => {
    const cyclic = { ok: 2 };
    cyclic.again = cyclic;
    const clip = normal({
      generator: {
        type: 'noise',
        seed: -5,
        params: { fn: () => 1, cyclic, list: new Array(1e5).fill(1) },
      },
      effects: [
        { type: 'blur', params: { radius: NaN, when: new Date(), mode: 'gaussian' } },
        ...Array.from({ length: 500 }, () => ({ type: 'tint' })),
      ],
    });
    assert.deepEqual(Object.keys(clip.generator.params), ['cyclic', 'list']);
    assert.deepEqual(clip.generator.params.cyclic, { ok: 2 });
    assert.equal(clip.generator.seed, 0, 'the seed is clamped to its range');
    assert.equal(clip.effects.length, MAX_EFFECTS);
    assert.deepEqual(clip.effects[0].params, { mode: 'gaussian' });
    assert.equal(new Set(clip.effects.map((fx) => fx.effectId)).size, MAX_EFFECTS);
    const edl = E.normalizeEdl(rawWith({ effects: clip.effects, generator: clip.generator }));
    assert.deepEqual(E.normalizeEdl(edl), edl);
    assert.doesNotThrow(() => JSON.stringify(edl));
  });

  it('bounds the number of keys and of animated paths', () => {
    const many = Array.from({ length: MAX_KEYS * 3 }, (_, i) => ({ t: i, v: i }));
    const paths = Object.fromEntries(
      Array.from({ length: MAX_PATHS * 2 }, (_, i) => [`generator.params.p${i}`, [{ t: 0, v: i }]]),
    );
    const clip = normal({ keyframes: { 'transform.x': many, ...paths } });
    assert.equal(clip.keyframes['transform.x'].length, MAX_KEYS);
    assert.equal(Object.keys(clip.keyframes).length, MAX_PATHS);
  });

  it('a patch merges into a bag: null removes, junk is ignored, nothing is mutated', () => {
    const base = deepFreeze({ angle: 10, tint: '#ff0000', point: { x: 1, y: 2 } });
    assert.equal(mergeBag(base, { angle: 10 }), base, 'no change, same object');
    assert.equal(
      mergeBag(base, { angle: NaN, tint: () => 1 }),
      base,
      'junk leaves the value alone',
    );
    assert.equal(mergeBag(base, 'junk'), base);
    assert.deepEqual(mergeBag(base, { angle: null, point: { x: 5 }, extra: [1] }), {
      tint: '#ff0000',
      point: { x: 5 },
      extra: [1],
    });
  });

  it('validateEdl refuses what the normaliser would not have produced', () => {
    const start = testEdl({
      v1: [
        testClip('g', 0, 2, {
          sourceFile: '',
          generator: { type: 'noise', seed: 1, params: {} },
          effects: [{ effectId: 'fx', type: 'blur', enabled: true, params: {} }],
        }),
      ],
    });
    const problems = (mutate) => {
      const edl = structuredClone(assertValid(start));
      mutate(edl.tracks[0].clips[0], edl);
      return E.validateEdl(edl).problems.map((problem) => problem.path);
    };
    const at = 'tracks[0].clips[0]';
    assert.deepEqual(
      problems((c) => (c.generator.params.bad = NaN)),
      [`${at}.generator.params`],
    );
    assert.deepEqual(
      problems((c) => (c.generator.params = [1])),
      [`${at}.generator.params`],
    );
    assert.deepEqual(
      problems((c) => (c.generator.seed = -1)),
      [`${at}.generator.seed`],
    );
    assert.deepEqual(
      problems((c) => (c.effects[0].params.d = new Date())),
      [`${at}.effects[0].params`],
    );
    assert.deepEqual(
      problems((c) => c.effects.push({ ...c.effects[0] })),
      [`${at}.effects[1].effectId`],
    );
    assert.deepEqual(
      problems((c) => (c.effects[0].enabled = 1)),
      [`${at}.effects[0].enabled`],
    );
    assert.deepEqual(
      problems((c) => (c.effects = {})),
      [`${at}.effects`],
    );
    assert.deepEqual(
      problems((c) => (c.blendMode = 'dodge')),
      [`${at}.blendMode`],
    );
    assert.deepEqual(
      problems((c) => (c.fadeOutCurve = 'bouncy')),
      [`${at}.fadeOutCurve`],
    );
    assert.deepEqual(
      problems((c) => (c.text.animateIn.type = 'explode')),
      [`${at}.text.animateIn.type`],
    );
    assert.deepEqual(
      problems((c) => delete c.text.lineHeight),
      [`${at}.text.lineHeight`],
    );
    assert.deepEqual(
      problems((_, edl) => (edl.tracks[0].opacity = 2)),
      ['tracks[0].opacity'],
    );
    assert.deepEqual(
      problems((_, edl) => (edl.tracks[0].blendMode = '')),
      ['tracks[0].blendMode'],
    );
    assert.deepEqual(
      problems((_, edl) => (edl.tracks[0].effects = null)),
      ['tracks[0].effects'],
    );
    const cyclic = {};
    cyclic.self = cyclic;
    assert.deepEqual(
      problems((c) => (c.generator.params = cyclic)),
      [`${at}.generator.params`],
    );
  });

  it('validateEdl checks keyframes: addressable path, complete sorted keys, fitting values', () => {
    const keyed = (keyframes) => {
      const clip = testClip('g', 0, 2, { sourceFile: '', text: { content: 'T' }, keyframes });
      return E.validateEdl(testEdl({ v1: [clip] })).problems.map(
        (p) => p.path.split('keyframes')[1],
      );
    };
    const key = (t, v, ease = 'linear') => ({ t, v, ease });
    assert.deepEqual(
      keyed({ 'transform.x': [key(0, 1), key(1, 2)], 'text.color': [key(0, '#fff000')] }),
      [],
    );
    assert.deepEqual(keyed({ 'transform.x': [key(1, 1), key(0, 2)] }), ['[transform.x][1].t']);
    assert.deepEqual(keyed({ 'transform.x': [key(0, 1), key(0, 2)] }), ['[transform.x][1].t']);
    assert.deepEqual(keyed({ 'transform.x': [] }), ['[transform.x]']);
    assert.deepEqual(keyed({ 'transform.x': [{ t: 0, v: 1 }] }), ['[transform.x][0].ease']);
    assert.deepEqual(keyed({ 'transform.x': [key(0, '#ffffff')] }), ['[transform.x][0].v']);
    assert.deepEqual(keyed({ 'transform.opacity': [key(0, 3)] }), ['[transform.opacity][0].v']);
    assert.deepEqual(keyed({ 'text.color': [key(0, 5)] }), ['[text.color][0].v']);
    assert.deepEqual(keyed({ 'transform.x': [key(NaN, 1)] }), ['[transform.x][0].t']);
    for (const path of [
      'sourceIn',
      'fadeIn',
      'text.content',
      'effects.nope.x',
      'generator.params.a',
    ]) {
      assert.deepEqual(keyed({ [path]: [key(0, 1)] }), [`[${path}]`], path);
    }
  });
});
