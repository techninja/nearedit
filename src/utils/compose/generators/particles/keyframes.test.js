import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen } from '../../../../../tests/compose/build.js';
import { draw, near } from '../../../../../tests/compose/pixels.js';
import { valueAt } from '../../../edl/animate.js';
import { coerceParam } from '../../params.js';
import { PARAMS } from './schema.js';

const BASE = {
  rate: 120,
  lifetime: 2,
  speed: 220,
  spread: 120,
  direction: 0,
  gravityY: 200,
  drag: 0.4,
  turbulence: 60,
  sprite: 'star',
  size: 40,
  rotationSpread: 360,
  spin: 60,
  blend: 'normal',
};
const KEYS = {
  'generator.params.position.x': [
    { t: 0, v: 0.3, ease: 'ease-in-out' },
    { t: 3, v: 0.7 },
  ],
  'generator.params.gravityY': [
    { t: 0.5, v: -300 },
    { t: 2.5, v: 900, ease: 'ease-out' },
    { t: 3.5, v: 0 },
  ],
  'generator.params.size': [
    { t: 0, v: 20 },
    { t: 4, v: 90 },
  ],
  'generator.params.color2': [
    { t: 1, v: '#22d3ee' },
    { t: 3, v: '#e11d48' },
  ],
  'generator.params.density': [
    { t: 0, v: 1 },
    { t: 4, v: 0.3 },
  ],
  'generator.params.spread': [
    { t: 0, v: 20, ease: 'sine' },
    { t: 4, v: 300 },
  ],
};
const scene = (params, extra = {}) => doc([[gen('p', 'particles', params, extra)]]);
const bytes = (edl, time) => Buffer.from(draw(edl, time).data);

/** The parameters with every keyframed one replaced by its value at a time. */
function frozenAt(time) {
  const params = { ...BASE, position: { x: 0.5, y: 0.5 } };
  for (const [path, keys] of Object.entries(KEYS)) {
    const value = valueAt(keys, time);
    if (path.endsWith('position.x')) params.position = { x: value, y: 0.5 };
    else params[path.split('.').pop()] = value;
  }
  return params;
}

describe('keyframed parameters', () => {
  it('draws each frame as if the parameters had always had their present values', () => {
    const animated = scene(BASE, { keyframes: KEYS });
    for (const time of [0, 0.4, 1.3, 2.5, 3.1, 3.99]) {
      const still = scene(frozenAt(time));
      assert.ok(bytes(animated, time).equals(bytes(still, time)), `frame at ${time} s`);
    }
    assert.ok(!bytes(animated, 2).equals(bytes(scene(BASE), 2)), 'the keyframes do something');
  });

  it('follows the keys through a split, a trim and a slip (they are in clip-local time)', () => {
    const late = scene(BASE, { keyframes: KEYS, sourceIn: 1.5, sourceOut: 5.5 });
    for (const time of [0, 1, 2.2]) {
      assert.ok(
        bytes(late, time).equals(bytes(scene(frozenAt(time + 1.5), { sourceIn: 1.5 }), time)),
      );
    }
  });

  it('moves the whole field with a keyframed emitter position', () => {
    const steady = { ...BASE, turbulence: 0 };
    const here = draw(scene(steady), 1.5);
    // An eighth of the frame to the right is 60 canvas pixels.
    const there = draw(scene({ ...steady, position: { x: 0.625, y: 0.5 } }), 1.5);
    let compared = 0;
    for (let y = 0; y < 270; y += 2) {
      for (let x = 0; x < 400; x += 2) {
        // The same particles at the same sub-pixel places: equal but for rounding.
        const [a, b] = [there.at(x + 60, y), here.at(x, y)];
        assert.ok(near(a, b, 1), `pixel ${x},${y}: ${a} against ${b}`);
        compared++;
      }
    }
    assert.ok(compared > 20000 && here.count((r) => r > 100) > 500);
  });

  it('thins the field with a keyframed density without moving what stays', () => {
    const calm = { ...BASE, colors: 1, fadeIn: 0, fadeOut: 0, spin: 0 };
    const full = draw(scene(calm), 2);
    const thin = draw(scene({ ...calm, density: 0.4 }), 2);
    const lit = (r) => r > 40;
    assert.ok(thin.count(lit) < full.count(lit) * 0.75 && thin.count(lit) > full.count(lit) * 0.2);
    let strays = 0;
    for (let i = 0; i < thin.data.length; i += 4) {
      if (thin.data[i] > 40 && full.data[i] <= 8) strays++;
    }
    assert.equal(strays, 0, 'a thinned particle is where it was');
  });

  it('changes smoothly: a small step of a parameter is a small step of the picture', () => {
    const calm = { ...BASE, rate: 0, burst: 60, colors: 1, turbulence: 0, spin: 0, size: 24 };
    const light = (params) => {
      const frame = draw(scene({ ...calm, ...params }), 1);
      let [sum, sx, sy] = [0, 0, 0];
      for (let y = 0; y < 270; y++) {
        for (let x = 0; x < 480; x++) {
          const v = frame.data[(y * 480 + x) * 4];
          sum += v;
          sx += v * x;
          sy += v * y;
        }
      }
      return [sx / sum, sy / sum, sum];
    };
    const steps = {
      speed: 4,
      gravityY: 8,
      gravityX: 8,
      drag: 0.02,
      direction: 1,
      swirl: 2,
      radial: 4,
    };
    for (const [name, step] of Object.entries(steps)) {
      const [ax, ay, a] = light({});
      const [bx, by, b] = light({ [name]: BASE[name] === undefined ? step : BASE[name] + step });
      const moved = Math.hypot(bx - ax, by - ay);
      assert.ok(moved < 1.5, `${name}: the centre of the light jumped ${moved} px`);
      assert.ok(Math.abs(b - a) / a < 0.03, `${name}: the amount of light jumped`);
    }
  });
});

describe('the parameter schema', () => {
  /** Numbers that set the schedule or scale a clock: read once, never keyframed. */
  const FIXED = [
    'driftX',
    'driftY',
    'rate',
    'emitFor',
    'burst',
    'burstEvery',
    'lifetime',
    'lifetimeJitter',
    'maxParticles',
    'turbulenceScale',
    'turbulenceSpeed',
    'colors',
    'twinkleSpeed',
  ];

  it('marks every number, colour and point animatable — except the documented few', () => {
    const fixed = [];
    for (const [name, spec] of Object.entries(PARAMS)) {
      const smooth = ['number', 'color', 'point'].includes(spec.type);
      if (smooth && !spec.animatable) fixed.push(name);
      if (!smooth) assert.ok(!spec.animatable, `${name} cannot be keyframed`);
    }
    assert.deepEqual(fixed, FIXED);
  });

  it('gives every parameter a label, a usable default and sane limits', () => {
    assert.ok(Object.keys(PARAMS).length >= 55);
    for (const [name, spec] of Object.entries(PARAMS)) {
      assert.ok(spec.label, `${name} has no label`);
      assert.deepEqual(coerceParam(spec, spec.default), spec.default, `${name} default`);
      if (spec.type === 'number') assert.ok(spec.min < spec.max, name);
      if (spec.type === 'select') assert.ok(spec.options.includes(spec.default), name);
      for (const [other, values] of Object.entries(spec.when || {})) {
        assert.ok(PARAMS[other], `${name} depends on unknown parameter ${other}`);
        const known = PARAMS[other].options || values;
        assert.ok(
          values.every((value) => known.includes(value)),
          `${name} when ${other}`,
        );
      }
    }
    assert.ok(!('seed' in PARAMS));
    assert.equal(PARAMS.image.type, 'image', 'so that requirements() lists the sprite');
  });
});
