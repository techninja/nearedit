import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../../tests/compose/build.js';
import { draw } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';
import { runModule } from '../applyEffects.js';
import { EFFECTS, effectModule } from '../catalog.js';
import { MAX_PAD, padFor } from '../filterPass.js';
import { composeFor } from '../host.js';

/** A footage frame the size of the test canvas: colour bars over a ramp, opaque. */
function card() {
  const canvas = createCanvas(480, 270);
  const ctx = canvas.getContext('2d');
  const ramp = ctx.createLinearGradient(0, 0, 480, 0);
  ramp.addColorStop(0, '#101820');
  ramp.addColorStop(1, '#f0e8d0');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, 480, 270);
  ['#e11d48', '#22c55e', '#2563eb', '#facc15'].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(60 + i * 90, 60, 60, 150);
  });
  return canvas;
}

const plate = card();
const env = createEnv({ frameOf: () => plate });
const footage = (effects, extra = {}) => doc([[media('v', '/m/clip.mp4', { effects, ...extra })]]);
const shape = (effects, params = {}) =>
  doc([[gen('s', 'shape', { width: 0.25, height: 0.25, ...params }, { effects })]], {
    background: '#203040',
  });
const frame = (edl, time = 1) => draw(edl, time, { env });
const same = (a, b, message) => assert.ok(Buffer.from(a.data).equals(Buffer.from(b.data)), message);

/** Settings at which an effect promises to change nothing at all. */
const NEUTRAL = [
  ['colorAdjust', {}],
  ['colorAdjust', { brightness: 0.5, exposure: 1 }],
  ['colorBalance', {}],
  ['levels', {}],
  ['tint', { amount: 0 }],
  ['tint', { mode: 'duotone', amount: 0 }],
  ['stylize', {}],
  ['blur', { radius: 0 }],
  ['blur', { kind: 'directional', radius: 0 }],
  ['glow', { radius: 0 }],
  ['glow', { intensity: 0 }],
  ['dropShadow', { opacity: 0 }],
  ['vignette', { amount: 0 }],
  ['grain', { amount: 0 }],
  ['scanlines', { opacity: 0 }],
  ['scanlines', { thickness: 0 }],
  ['flicker', { amount: 0 }],
  ['pixelate', { size: 1 }],
  ['rgbSplit', { distance: 0 }],
  ['mask', { width: 0, invert: true }],
  ['wipe', { progress: 1 }],
  ['wipe', { progress: 0, invert: true, shape: 'iris' }],
];

describe('the effect library', () => {
  it('registers every effect once, as a filter or an apply pass', () => {
    const kinds = Object.fromEntries(EFFECTS.map((effect) => [effect.type, effect.kind]));
    assert.equal(Object.keys(kinds).length, EFFECTS.length, 'no type is listed twice');
    const filters = EFFECTS.filter((effect) => effect.kind === 'filter').map((e) => e.type);
    assert.deepEqual(filters.sort(), ['colorAdjust', 'dropShadow', 'flicker', 'stylize']);
    for (const type of ['blur', 'glow', 'chromaKey', 'wipe', 'rgbSplit', 'grain', 'mask']) {
      assert.equal(kinds[type], 'apply', type);
    }
    for (const type of ['tint', 'vignette', 'pixelate', 'levels', 'colorBalance', 'posterize']) {
      assert.equal(kinds[type], 'apply', type);
    }
    assert.equal(EFFECTS.length, 19);
  });

  it('describes every parameter: label, default, and a range for numbers', () => {
    const categories = ['color', 'blur', 'stylize', 'light', 'key', 'distort'];
    for (const effect of EFFECTS) {
      assert.ok(categories.includes(effect.category), `${effect.type}: ${effect.category}`);
      assert.ok(effect.description.length > 10, `${effect.type} has no description`);
      for (const [name, spec] of Object.entries(effect.params)) {
        const where = `${effect.type}.${name}`;
        assert.ok(spec.label || /^[a-z]+$/.test(name), `${where} needs a label`);
        if (spec.type !== 'number') continue;
        assert.ok(Number.isFinite(spec.min) && Number.isFinite(spec.max), `${where} has no range`);
        assert.ok(spec.default >= spec.min && spec.default <= spec.max, `${where} default`);
      }
    }
  });

  it('draws every effect at its defaults without a warning, the same twice', () => {
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      for (const { type } of EFFECTS) {
        const first = frame(footage([fx(type)]));
        same(first, frame(footage([fx(type)])), `${type} is not deterministic`);
        frame(shape([fx(type)]));
      }
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, []);
  });

  it('changes nothing at neutral settings — not one byte', () => {
    const plain = [frame(footage([])), frame(shape([]))];
    for (const [type, params] of NEUTRAL) {
      const label = `${type} ${JSON.stringify(params)}`;
      same(frame(footage([fx(type, params)])), plain[0], `${label} changed footage`);
      same(frame(shape([fx(type, params)])), plain[1], `${label} changed a shape on transparency`);
    }
  });

  it('skips disabled effects', () => {
    const plain = frame(footage([]));
    for (const { type } of EFFECTS) {
      same(frame(footage([fx(type, {}, false)])), plain, `disabled ${type} drew`);
    }
    const all = EFFECTS.map(({ type }) => fx(type, {}, false));
    same(frame(footage(all)), plain, 'a stack of disabled effects drew');
  });

  it('leaves an empty layer empty, whatever the effect', () => {
    const nothing = frame(shape([], { width: 0 }));
    assert.equal(
      nothing.count((r, g, b) => r !== 0x20 || g !== 0x30 || b !== 0x40),
      0,
    );
    for (const { type } of EFFECTS) {
      same(frame(shape([fx(type)], { width: 0 })), nothing, `${type} drew on an empty layer`);
    }
  });

  it('keeps what is far from the layer transparent', () => {
    // A 120×68 px square in the middle; the corners are far beyond any default reach.
    for (const { type } of EFFECTS) {
      if (type === 'mirror' || type === 'pixelate') continue;
      const drawn = frame(shape([fx(type)]));
      for (const [x, y] of [
        [2, 2],
        [477, 2],
        [2, 267],
        [477, 267],
      ]) {
        assert.deepEqual(drawn.at(x, y), [0x20, 0x30, 0x40], `${type} at ${x},${y}`);
      }
    }
  });

  it('follows keyframed parameters: numbers, colours and points', () => {
    const keyed = (effect, path, keys) =>
      footage([effect], { keyframes: { [`effects.${effect.effectId}.${path}`]: keys } });
    const ramp = [
      { t: 0, v: 0 },
      { t: 2, v: 1 },
    ];
    const wipe = keyed(fx('wipe', { feather: 0 }), 'progress', ramp);
    const lit = (time) => frame(wipe, time).count((r, g, b) => r + g + b > 0) / (480 * 270);
    for (const [time, part] of [
      [0, 0],
      [0.5, 0.25],
      [1, 0.5],
      [1.5, 0.75],
      [2, 1],
      [3, 1],
    ]) {
      assert.ok(Math.abs(lit(time) - part) < 0.01, `wipe at ${time} s shows ${lit(time)}`);
    }
    const tint = keyed(fx('tint', { mode: 'duotone', shadows: '#000000' }), 'highlights', [
      { t: 0, v: '#ff0000' },
      { t: 2, v: '#0000ff' },
    ]);
    const bright = (time) => frame(tint, time).at(470, 20);
    assert.ok(bright(0)[0] > 200 && bright(0)[2] < 10, `starts red: ${bright(0)}`);
    assert.ok(Math.abs(bright(1)[0] - bright(1)[2]) < 12, `half way: ${bright(1)}`);
    assert.ok(bright(2)[2] > 200 && bright(2)[0] < 10, `ends blue: ${bright(2)}`);
    const moving = keyed(fx('vignette', { amount: 1, size: 0.2, softness: 0.2 }), 'center.x', [
      { t: 0, v: 0 },
      { t: 2, v: 1 },
    ]);
    const lum = (picture, x) => picture.at(x, 135).reduce((sum, v) => sum + v, 0);
    assert.ok(lum(frame(moving, 0), 5) > 60 && lum(frame(moving, 0), 470) === 0);
    assert.ok(lum(frame(moving, 2), 470) > 60 && lum(frame(moving, 2), 5) === 0);
  });

  it('gives a module every parameter of its schema, defaults filled in', () => {
    for (const { type, params } of EFFECTS) {
      const module = effectModule(type);
      assert.equal(typeof (module.filter || module.apply), 'function', type);
      assert.ok(!(module.filter && module.apply), `${type} must be one kind`);
      assert.ok(Object.keys(params).length > 0, `${type} has no parameters`);
    }
  });
});

describe('filter padding', () => {
  it('pads in a few fixed steps so an animated radius reuses canvases', () => {
    assert.equal(padFor(0), 0);
    assert.equal(padFor(-3), 0);
    assert.equal(padFor(1), 16);
    assert.equal(padFor(16), 16);
    assert.equal(padFor(17), 32);
    assert.equal(padFor(200), 256);
    assert.equal(padFor(1e6), MAX_PAD);
  });
});

describe('running a module', () => {
  const { pool } = composeFor(createEnv());

  it('contains a failure: drawing state and borrowed surfaces are restored', () => {
    pool.begin(64, 36);
    const surface = pool.acquire();
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      for (let i = 0; i < 2; i++) {
        runModule('effect "broken"', surface.ctx, pool, () => {
          surface.ctx.globalAlpha = 0.1;
          surface.ctx.translate(50, 50);
          pool.lease(64, 36);
          throw new Error('boom');
        });
      }
    } finally {
      console.warn = warn;
    }
    assert.equal(surface.ctx.globalAlpha, 1);
    assert.equal(surface.ctx.getTransform().e, 0);
    assert.equal(pool.stats().leased, 0);
    assert.equal(warnings.length, 1, 'warned once, not once per frame');
    assert.match(warnings[0], /effect "broken" failed and was skipped: boom/);
  });
});
