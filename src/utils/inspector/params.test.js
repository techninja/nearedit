import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, GENERATORS } from '#utils/compose/catalog.js';
import { isShown, numberSpec, paramControls, wantsSlider } from './paramControls.js';
import { paramSections, paramStem, sameFamily } from './paramSections.js';

/** A schema with one parameter of every type the contract allows. */
const SCHEMA = {
  amount: { type: 'number', default: 0.5, min: 0, max: 1, animatable: true },
  size: {
    type: 'number',
    default: 40,
    min: 0,
    max: 16000,
    unit: 'px',
    label: 'Size',
    animatable: true,
  },
  sides: { type: 'number', default: 6, min: 3, max: 24, step: 1, when: { shape: ['polygon'] } },
  free: { type: 'number', default: 3 },
  tint: { type: 'color', default: '#ff0000', animatable: true },
  invert: { type: 'boolean', default: false, animatable: true },
  shape: { type: 'select', default: 'star', options: ['star', 'polygon', 'soft-edge'] },
  caption: { type: 'text', default: 'Hello', label: 'Words' },
  sprite: { type: 'image', default: '' },
  centre: { type: 'point', default: { x: 0.5, y: 0.5 }, animatable: true },
};
const byName = (controls) => Object.fromEntries(controls.map((c) => [c.name, c]));

describe('paramControls', () => {
  it('makes one control per parameter with its kind, label, path and value', () => {
    const controls = paramControls(SCHEMA, { size: 120, tint: '#00ff00' }, 'effects.fx_1');
    const c = byName(controls);
    assert.deepEqual(
      controls.map((control) => control.name),
      ['amount', 'size', 'free', 'tint', 'invert', 'shape', 'caption', 'sprite', 'centre'],
    );
    assert.equal(c.size.path, 'effects.fx_1.size');
    assert.equal(c.size.label, 'Size');
    assert.equal(c.amount.label, 'Amount');
    assert.equal(c.caption.label, 'Words');
    assert.equal(c.size.value, 120);
    assert.equal(c.amount.value, 0.5, 'a missing parameter shows its default');
    assert.equal(c.tint.value, '#00ff00');
    assert.deepEqual(c.centre.value, { x: 0.5, y: 0.5 });
    assert.deepEqual(c.shape.options, [
      ['star', 'Star'],
      ['polygon', 'Polygon'],
      ['soft-edge', 'Soft edge'],
    ]);
  });

  it('honours `when`: a control shows only while the other parameter allows it', () => {
    assert.ok(!byName(paramControls(SCHEMA, {}, 'p')).sides);
    assert.ok(byName(paramControls(SCHEMA, { shape: 'polygon' }, 'p')).sides);
    assert.equal(isShown(undefined, {}), true);
    assert.equal(isShown({ stops: [3, 4] }, { stops: 3 }), true);
    assert.equal(isShown({ stops: [3, 4] }, { stops: '4' }), true, 'compares loosely');
    assert.equal(isShown({ stops: [3, 4] }, { stops: 2 }), false);
    assert.equal(isShown({ a: [1], b: ['x'] }, { a: 1, b: 'y' }), false, 'every hint must hold');
  });

  it('says which paths a keyframe button drives', () => {
    const c = byName(paramControls(SCHEMA, {}, 'generator.params'));
    assert.deepEqual(c.amount.keyPaths, ['generator.params.amount']);
    assert.deepEqual(c.centre.keyPaths, ['generator.params.centre.x', 'generator.params.centre.y']);
    assert.deepEqual(c.tint.keyPaths, ['generator.params.tint']);
    assert.deepEqual(c.free.keyPaths, [], 'not marked animatable');
    assert.deepEqual(c.invert.keyPaths, [], 'a switch cannot be keyframed');
    assert.equal(c.invert.animatable, false);
  });

  it('derives range, step and precision of number fields and offers sliders that help', () => {
    assert.deepEqual(numberSpec(SCHEMA.amount), { step: 0.01, decimals: 3, min: 0, max: 1 });
    assert.deepEqual(numberSpec(SCHEMA.size), {
      step: 1,
      decimals: 1,
      min: 0,
      max: 16000,
      unit: 'px',
    });
    assert.deepEqual(numberSpec(SCHEMA.free), { step: 1, decimals: 1 });
    assert.equal(numberSpec({ type: 'number', default: 0, min: 0, max: 10 }).step, 0.1);
    const c = byName(paramControls(SCHEMA, { shape: 'polygon' }, 'p'));
    assert.equal(c.amount.slider, true);
    assert.equal(c.sides.slider, true);
    assert.equal(c.size.slider, false, '16 000 positions is no slider');
    assert.equal(c.free.slider, false, 'no range, no slider');
    assert.equal(wantsSlider({ min: 0, max: 360, step: 1 }), true);
    assert.equal(c.centre.spec.unit, '%');
  });

  it('builds controls for every generator and effect of the catalog', () => {
    for (const module of [...GENERATORS, ...EFFECTS]) {
      const controls = paramControls(module.params, {}, 'x');
      assert.ok(controls.length <= Object.keys(module.params).length, module.type);
      for (const control of controls) {
        assert.ok(control.label, `${module.type}.${control.name} has a label`);
        assert.ok(control.value !== undefined, `${module.type}.${control.name} has a value`);
        if (control.type === 'number') assert.ok(control.spec.step > 0);
        if (control.type === 'select') assert.ok(control.options.length > 0);
      }
    }
  });

  it('copes with a missing schema', () => {
    assert.deepEqual(paramControls(undefined, { a: 1 }, 'x'), []);
  });
});

describe('paramSections', () => {
  const controls = (names) => names.map((name) => ({ name, path: `p.${name}` }));

  it('leaves a short list whole and counts what is set', () => {
    const parts = paramSections(controls(['radius', 'amount']), { amount: 2 });
    assert.equal(parts.length, 1);
    assert.deepEqual([parts[0].title, parts[0].changed, parts[0].controls.length], ['', 1, 2]);
  });

  it('knows the family of a parameter from its name', () => {
    assert.deepEqual(
      ['emitterWidth', 'emitter', 'color2', 'gravityX', 'size', 'bias'].map(paramStem),
      ['emitter', 'emitter', 'color', 'gravity', 'size', 'bias'],
    );
    assert.equal(sameFamily('colors', 'color3'), true);
    assert.equal(sameFamily('sizeStart', 'size'), true);
    assert.equal(sameFamily('spin', 'spread'), false);
  });

  it('gathers a long list into sections that keep families together', () => {
    const names = [
      ...['emitter', 'emitterWidth', 'emitterHeight', 'rate', 'density', 'burst', 'burstEvery'],
      ...['speed', 'speedJitter', 'spread', 'gravityX', 'gravityY', 'drag'],
      ...['size', 'sizeJitter', 'sizeStart', 'sizeEnd'],
    ];
    const parts = paramSections(controls(names), { sizeEnd: 0, burst: 4 });
    assert.deepEqual(
      parts.map((part) => [part.title, part.controls.length, part.changed]),
      [
        ['Emitter · Rate · Density …', 7, 1],
        ['Speed · Spread · Gravity …', 6, 0],
        ['Size', 4, 1],
      ],
    );
    assert.equal(parts.flatMap((part) => part.controls).length, names.length);
  });

  it('follows the group hints of a schema when it has them', () => {
    const schema = { a: { group: 'Shape' }, b: { group: 'Shape' }, c: { group: 'Colour' }, d: {} };
    const parts = paramSections(controls(['a', 'b', 'c', 'd']), {}, schema);
    assert.deepEqual(
      parts.map((part) => [part.title, part.controls.length]),
      [
        ['Shape', 2],
        ['Colour', 1],
        ['D', 1],
      ],
    );
  });

  it('sections the longest schema of the real catalog without losing a control', () => {
    const [longest] = [...GENERATORS].sort(
      (a, b) => Object.keys(b.params).length - Object.keys(a.params).length,
    );
    const all = paramControls(longest.params, {}, 'generator.params');
    const parts = paramSections(all, {}, longest.params);
    assert.equal(parts.flatMap((part) => part.controls).length, all.length);
    if (all.length > 12) assert.ok(parts.length > 1 && parts.every((part) => part.title));
  });
});
