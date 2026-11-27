import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createEnv } from '../../../api/compose/index.js';
import { runModule } from '../applyEffects.js';
import { EFFECTS, effectModule } from '../catalog.js';
import { MAX_PAD, padFor } from '../filterPass.js';
import { composeFor } from '../host.js';

const square = (effects, params = {}) =>
  draw(doc([[gen('s', 'shape', { width: 0.25, height: 0.25, ...params }, { effects })]]));
const flat = (effects, color = '#646464') =>
  draw(doc([[gen('s', 'solid', { color }, { effects })]]));
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);

describe('blur', () => {
  it('is a filter effect whose radius is in output pixels', () => {
    const blur = effectModule('blur');
    assert.equal(EFFECTS.find((fx) => fx.type === 'blur').kind, 'filter');
    assert.equal(blur.filter({ radius: 8 }, { scale: 0.25 }), 'blur(2px)');
    assert.equal(blur.filter({ radius: 0 }, { scale: 1 }), '');
    assert.equal(blur.reach({ radius: 8 }, { scale: 0.25 }), 6);
  });

  it('softens edges and spreads the layer past its rectangle', () => {
    const sharp = square([]);
    const soft = square([fx('blur', { radius: 40 })]);
    assert.deepEqual(sharp.at(0.5, 0.5), [255, 255, 255]);
    assert.deepEqual(sharp.at(0.36, 0.5), [0, 0, 0]);
    const outside = soft.at(0.36, 0.5)[0];
    const inside = soft.at(0.39, 0.5)[0];
    assert.ok(outside > 20 && outside < inside && inside < 250, `${outside} then ${inside}`);
    assert.deepEqual(
      square([fx('blur', { radius: 0 })]).data,
      sharp.data,
      'radius 0 changes nothing',
    );
  });

  it('does not darken the edges of a picture that fills the frame', () => {
    const frame = flat([fx('blur', { radius: 60 })]);
    assert.equal(
      frame.count((r, g, b) => r !== 100 || g !== 100 || b !== 100),
      0,
    );
  });

  it('keeps transparent edges transparent', () => {
    const frame = square([fx('blur', { radius: 20 })]);
    for (const [x, y] of [
      [0, 0],
      [479, 269],
      [0.5, 0],
      [0, 0.5],
    ])
      close(frame.at(x, y), [0, 0, 0], 0);
  });

  it('gives the same result whether filters run merged or one by one', () => {
    const merged = square([fx('blur', { radius: 24 }), fx('blur', { radius: 24 })]);
    // A glow of intensity 0 does nothing but sits between the blurs, so they cannot merge.
    const apart = square([
      fx('blur', { radius: 24 }),
      fx('glow', { intensity: 0 }),
      fx('blur', { radius: 24 }),
    ]);
    let worst = 0;
    for (let i = 0; i < merged.data.length; i++) {
      worst = Math.max(worst, Math.abs(merged.data[i] - apart.data[i]));
    }
    assert.ok(worst <= 2, `merged and separate passes differ by ${worst} levels`);
    assert.ok(merged.at(0.36, 0.5)[0] > square([fx('blur', { radius: 24 })]).at(0.36, 0.5)[0]);
  });
});

describe('glow', () => {
  it('is an apply effect that adds a blurred copy back', () => {
    assert.equal(EFFECTS.find((fx) => fx.type === 'glow').kind, 'apply');
    const plain = square([], { fill: '#804020' });
    const glowing = square([fx('glow', { radius: 30, intensity: 1 })], { fill: '#804020' });
    close(glowing.at(0.5, 0.5), [255, 128, 64], 4, 'the layer plus itself in its middle:');
    assert.deepEqual(plain.at(0.34, 0.5), [0, 0, 0]);
    const halo = glowing.at(0.36, 0.5);
    assert.ok(
      halo[0] > 15 && halo[0] > halo[1] && halo[1] > halo[2],
      `halo keeps the hue: ${halo}`,
    );
  });

  it('grows with intensity and does nothing at zero', () => {
    const at = (intensity) => square([fx('glow', { radius: 30, intensity })]).at(0.36, 0.5)[0];
    assert.equal(at(0), 0);
    assert.ok(at(0.5) < at(1) && at(1) < at(2.5), `${at(0.5)}, ${at(1)}, ${at(2.5)}`);
    assert.deepEqual(square([fx('glow', { radius: 0 })]).data, square([]).data);
  });

  it('glows evenly up to the edge of a full-frame picture', () => {
    const frame = flat([fx('glow', { radius: 50, intensity: 1 })], '#404040');
    assert.equal(
      frame.count((r) => Math.abs(r - 128) > 1),
      0,
    );
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
