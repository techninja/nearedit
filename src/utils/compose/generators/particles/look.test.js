import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveParams } from '../../params.js';
import { FEATHER, alphaAt, angleAt, flipAt, lookOf, sizeAt } from './look.js';
import { RAMP_STEPS, rampOf, stepAt } from './ramp.js';
import { PARAMS } from './schema.js';

const SEED = 21;
/** Parameters without variation between particles or fades, unless asked for. */
const params = (over = {}) =>
  resolveParams(PARAMS, { sizeJitter: 0, fadeIn: 0, fadeOut: 0, ...over });
const look = (over) => lookOf(params(over));
const near = (actual, expected, tolerance = 1e-9, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} got ${actual}, want ${expected}`);
const many = (visit, count = 2000) => Array.from({ length: count }, (_, index) => visit(index));

describe('size over life', () => {
  it('goes from its size at birth to its size at death', () => {
    const l = look({ size: 40, sizeStart: 1, sizeEnd: 0.25 });
    near(sizeAt(l, SEED, 0, 0, 0), 40);
    near(sizeAt(l, SEED, 0, 0, 0.5), 25);
    near(sizeAt(l, SEED, 0, 0, 1), 10);
    near(sizeAt(look({ size: 40, sizeStart: 0, sizeEnd: 2 }), SEED, 0, 0, 0.25), 20);
  });

  it('follows the size curve', () => {
    const early = look({ size: 100, sizeStart: 0, sizeEnd: 1, sizeCurve: 'ease-out' });
    const late = look({ size: 100, sizeStart: 0, sizeEnd: 1, sizeCurve: 'ease-in' });
    near(sizeAt(early, SEED, 0, 0, 0.5), 87.5);
    near(sizeAt(late, SEED, 0, 0, 0.5), 12.5);
    near(sizeAt(look({ size: 100, sizeCurve: 'hold', sizeEnd: 3 }), SEED, 0, 0, 0.99), 100);
    // A curve that overshoots below zero never gives a negative size.
    const dip = look({ size: 100, sizeStart: 0, sizeEnd: 1, sizeCurve: 'back-in' });
    assert.equal(sizeAt(dip, SEED, 0, 0, 0.2), 0);
  });

  it('varies between particles by the jitter, and stays each particle’s own', () => {
    const l = look({ size: 50, sizeJitter: 0.6 });
    const sizes = many((index) => sizeAt(l, SEED, index, 0, 0.3));
    assert.ok(Math.min(...sizes) >= 20 && Math.min(...sizes) < 21);
    assert.ok(Math.max(...sizes) <= 50 && Math.max(...sizes) > 49);
    assert.equal(sizeAt(l, SEED, 5, 0, 0.3), sizeAt(l, SEED, 5, 0, 0.3));
    assert.notEqual(sizeAt(l, SEED, 5, 0, 0.3), sizeAt(l, SEED, 5, 1, 0.3), 'bursts differ');
  });
});

describe('opacity over life', () => {
  it('fades in over the first share of the life and out over the last', () => {
    const l = look({ opacity: 0.8, fadeIn: 0.2, fadeOut: 0.4 });
    near(alphaAt(l, SEED, 0, 0, 0, 0), 0);
    near(alphaAt(l, SEED, 0, 0, 0.1, 0), 0.4);
    near(alphaAt(l, SEED, 0, 0, 0.2, 0), 0.8);
    near(alphaAt(l, SEED, 0, 0, 0.5, 0), 0.8);
    near(alphaAt(l, SEED, 0, 0, 0.8, 0), 0.4);
    near(alphaAt(l, SEED, 0, 0, 0.9, 0), 0.2);
    near(alphaAt(look({ opacity: 0.5 }), SEED, 0, 0, 0, 0), 0.5, 1e-9, 'no fade, no ramp:');
  });

  it('thins the field with density, each particle fading rather than popping', () => {
    const shown = (density) => {
      const l = look({ density });
      return many((index) => alphaAt(l, SEED, index, 0, 0.5, 1));
    };
    assert.ok(shown(1).every((alpha) => alpha === 1));
    assert.ok(shown(0).every((alpha) => alpha === 0));
    const half = shown(0.5);
    const visible = half.filter((alpha) => alpha > 0).length;
    assert.ok(Math.abs(visible - 2000 * (0.5 / (1 - FEATHER))) < 80, `${visible} of 2000 at 0.5`);
    assert.ok(
      half.some((alpha) => alpha > 0 && alpha < 1),
      'some are part-way in',
    );
    // Raising density only ever raises a particle's opacity, and by small steps.
    const more = shown(0.51);
    half.forEach((alpha, index) => {
      assert.ok(more[index] >= alpha && more[index] - alpha <= 0.01 / FEATHER + 1e-9);
    });
  });

  it('pulses between full and (1 − twinkle), each particle at its own pace', () => {
    const l = look({ twinkle: 0.7, twinkleSpeed: 2 });
    const values = [];
    for (let age = 0; age < 4; age += 0.01) values.push(alphaAt(l, SEED, 3, 0, 0.5, age));
    near(Math.max(...values), 1, 1e-3);
    near(Math.min(...values), 0.3, 1e-3);
    const peaks = values.filter(
      (v, i) => i && i < values.length - 1 && v > values[i - 1] && v >= values[i + 1],
    );
    assert.ok(
      peaks.length >= 4 && peaks.length <= 12,
      `${peaks.length} pulses in 4 s at 1–3 per second`,
    );
    assert.notEqual(alphaAt(l, SEED, 3, 0, 0.5, 1), alphaAt(l, SEED, 4, 0, 0.5, 1));
  });
});

describe('turning', () => {
  const DEG = Math.PI / 180;

  it('starts at the rotation and turns at the spin', () => {
    const l = look({ rotation: 30, spin: 90 });
    near(angleAt(l, SEED, 0, 0, 0), 30 * DEG);
    near(angleAt(l, SEED, 0, 0, 2), 210 * DEG);
    assert.equal(l.turns, true);
    assert.equal(look({}).turns, false);
  });

  it('spreads starting angles and spins around their values', () => {
    const l = look({ rotation: 10, rotationSpread: 90, spin: 0, spinSpread: 200 });
    const starts = many((index) => angleAt(l, SEED, index, 0, 0) / DEG);
    assert.ok(Math.min(...starts) >= -35 && Math.min(...starts) < -33);
    assert.ok(Math.max(...starts) <= 55 && Math.max(...starts) > 53);
    const spins = many(
      (index) => (angleAt(l, SEED, index, 0, 1) - angleAt(l, SEED, index, 0, 0)) / DEG,
    );
    assert.ok(Math.min(...spins) >= -100 && Math.min(...spins) < -97, 'both ways round');
    assert.ok(Math.max(...spins) <= 100 && Math.max(...spins) > 97);
  });

  it('tumbles between face-on and face-away', () => {
    const l = look({ flip: 1 });
    const faces = [];
    for (let age = 0; age < 3; age += 0.01) faces.push(flipAt(l, SEED, 1, 0, age));
    near(Math.max(...faces), 1, 1e-3);
    near(Math.min(...faces), -1, 1e-3);
    assert.notEqual(
      flipAt(l, SEED, 1, 0, 0),
      flipAt(l, SEED, 2, 0, 0),
      'each starts at its own angle',
    );
  });
});

describe('colours', () => {
  it('walks from the first colour to the last over a life', () => {
    const ramp = rampOf(params({ color1: '#ff0000', color2: '#0000ff' }));
    assert.equal(ramp.fills.length, RAMP_STEPS);
    assert.equal(ramp.fills[0], '#ff0000');
    assert.equal(ramp.fills[RAMP_STEPS - 1], '#0000ff');
    assert.equal(stepAt(ramp, SEED, 0, 0, 0), 0);
    assert.equal(stepAt(ramp, SEED, 0, 0, 1), RAMP_STEPS - 1);
    const middle = ramp.fills[stepAt(ramp, SEED, 0, 0, 0.5)];
    assert.match(middle, /^#(7b|84)00(7b|84)$/, `halfway is ${middle}`);
  });

  it('passes through every colour of a longer list, alpha included', () => {
    const ramp = rampOf(
      params({ colors: 3, color1: '#ff0000', color2: '#00ff00', color3: '#0000ff80' }),
    );
    assert.equal(ramp.fills[0], '#ff0000');
    assert.equal(ramp.fills[RAMP_STEPS - 1], '#0000ff');
    const greenest = Math.max(...ramp.fills.map((fill) => parseInt(fill.slice(3, 5), 16)));
    assert.ok(greenest > 240, `the middle colour is reached: green ${greenest}`);
    near(ramp.alphas[0], 1);
    near(ramp.alphas[RAMP_STEPS - 1], 128 / 255);
    assert.ok(ramp.alphas[RAMP_STEPS - 4] < 1 && ramp.alphas[RAMP_STEPS - 4] > 0.5);
  });

  it('needs a single step when the colour never changes', () => {
    assert.equal(rampOf(params({ colors: 1 })).fills.length, 1);
    const same = rampOf(params({ color1: '#123456', color2: '#123456' }));
    assert.deepEqual(same.fills, ['#123456']);
    assert.equal(stepAt(same, SEED, 9, 0, 0.7), 0);
  });

  it('gives each particle one colour of the list for life when colours are random', () => {
    const p = params({ colorMode: 'random', colors: 4, color4: '#101010' });
    const ramp = rampOf(p);
    assert.deepEqual(ramp.fills, [p.color1, p.color2, p.color3, '#101010']);
    const picks = many((index) => stepAt(ramp, SEED, index, 0, 0.1));
    for (let step = 0; step < 4; step++) {
      const count = picks.filter((pick) => pick === step).length;
      assert.ok(Math.abs(count - 500) < 70, `colour ${step + 1} picked ${count} times of 2000`);
    }
    assert.equal(stepAt(ramp, SEED, 7, 0, 0.1), stepAt(ramp, SEED, 7, 0, 0.9));
  });

  it('names a ramp by its colours, so sprites are tinted once per ramp', () => {
    const a = rampOf(params({ color1: '#ff0000' }));
    assert.equal(a.key, rampOf(params({ color1: '#ff0000' })).key);
    assert.notEqual(a.key, rampOf(params({ color1: '#ff0001' })).key);
  });
});
