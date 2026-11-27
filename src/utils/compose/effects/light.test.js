import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createCanvas } from '../../../api/compose/index.js';
import { EFFECTS, effectModule } from '../catalog.js';
import { flickerLevel } from './flicker.js';
import { lightToAlpha } from './glow.js';
import { vignetteAt } from './vignette.js';

// A 120 × 54 px shape in the middle of the 480 × 270 canvas: 180..300 × 108..162.
const square = (effects, params = {}, background = '#000000') =>
  draw(
    doc([[gen('s', 'shape', { width: 0.25, height: 0.2, ...params }, { effects })]], {
      background,
    }),
  );
const clamp = (v) => Math.max(0, Math.min(255, v));
const flat = (effects, color = '#646464') =>
  draw(doc([[gen('s', 'solid', { color }, { effects })]]));
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
/** The normal distribution's cumulative function. */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = 0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)));
  const tail = 0.3989423 * Math.exp((-z * z) / 2) * t * poly;
  return z >= 0 ? 1 - tail : tail;
}

describe('glow', () => {
  it('adds a blurred copy of the layer back on top', () => {
    assert.equal(EFFECTS.find((e) => e.type === 'glow').kind, 'apply');
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

  it('grows with intensity and glows evenly to the edge of a full frame', () => {
    const at = (intensity) => square([fx('glow', { radius: 30, intensity })]).at(0.36, 0.5)[0];
    assert.ok(at(0.5) < at(1) && at(1) < at(2.5), `${at(0.5)}, ${at(1)}, ${at(2.5)}`);
    for (const radius of [8, 50, 160]) {
      const frame = flat([fx('glow', { radius, intensity: 1 })], '#404040');
      assert.equal(
        frame.count((r) => Math.abs(r - 128) > 1),
        0,
        `radius ${radius}`,
      );
    }
  });

  it('glows only what is brighter than the threshold', () => {
    const glow = (color, threshold, intensity = 0.5) =>
      flat([fx('glow', { radius: 40, intensity, threshold })], color).at(0.5, 0.5);
    close(glow('#808080', 0.6), [128, 128, 128], 0, 'below the threshold nothing is added:');
    // (0.8 − 0.6) / (1 − 0.6) = half of full light, at intensity 0.2 a tenth.
    close(glow('#cccccc', 0.6, 0.2), Array(3).fill(204 + 255 * 0.1), 3);
    close(glow('#cc4020', 0.6, 0.2), [204 + 255 * 0.1, 64, 32], 3, 'channel by channel:');
    close(glow('#404040', 0, 1), [128, 128, 128], 2);
  });

  it('is light only: a dark layer casts no halo, and alpha grows no more than the light', () => {
    const dark = square([fx('glow', { radius: 30, intensity: 2 })], { fill: '#000000' }, '#ffffff');
    assert.equal(
      dark.count((r, g, b) => r !== 255 && r !== 0),
      0,
      'black on white stays a clean black square',
    );
    const red = square([fx('glow', { radius: 30, intensity: 1 })], { fill: '#ff0000' }, '#0000ff');
    const [r, g, b] = red.at(0.36, 0.5);
    assert.ok(r > 30 && g === 0 && Math.abs(r + b - 255) <= 3, `red light over blue: ${[r, g, b]}`);
  });

  it('turns light on black into colour with just enough alpha', () => {
    const canvas = createCanvas(3, 1);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(3, 1);
    image.data.set([30, 20, 10, 255, 0, 0, 0, 255, 200, 100, 0, 255]);
    ctx.putImageData(image, 0, 0);
    lightToAlpha(ctx, 3, 1, 2);
    const out = [...ctx.getImageData(0, 0, 3, 1).data];
    assert.deepEqual(out.slice(0, 4), [255, 170, 85, 60]);
    assert.deepEqual(out.slice(4, 8), [0, 0, 0, 0]);
    assert.deepEqual(out.slice(8, 12), [255, 200, 0, 255], 'past full brightness it clips');
  });
});

describe('dropShadow', () => {
  const shadow = (params, background = '#ffffff') =>
    square(
      [fx('dropShadow', { x: 40, y: 20, blur: 0, opacity: 0.5, ...params })],
      { fill: '#00ff00' },
      background,
    );

  it('is one filter function, lengths scaled to the canvas', () => {
    const module = effectModule('dropShadow');
    const params = { x: 12, y: -8, blur: 4, color: '#102030', opacity: 0.5 };
    assert.equal(
      module.filter(params, { scale: 0.5 }),
      'drop-shadow(6px -4px 2px rgba(16, 32, 48, 0.5))',
    );
    assert.equal(module.filter({ ...params, opacity: 0 }, { scale: 1 }), '');
    assert.equal(module.reach(params, { scale: 0.5 }), (12 + 12) * 0.5);
    assert.equal(EFFECTS.find((e) => e.type === 'dropShadow').kind, 'filter');
  });

  it('draws the layer shape again, offset, in the colour and opacity given', () => {
    const picture = shadow({});
    // Offset 40, 20 output pixels is 10, 5 canvas pixels.
    close(picture.at(305, 165), [128, 128, 128], 1, 'shadow over white:');
    close(picture.at(305, 120), [128, 128, 128], 1);
    close(picture.at(240, 135), [0, 255, 0], 0, 'the layer is on top of its shadow:');
    close(picture.at(185, 112), [0, 255, 0], 0);
    close(picture.at(175, 135), [255, 255, 255], 0, 'nothing on the far side:');
    close(picture.at(312, 135), [255, 255, 255], 0, 'nor past the offset:');
    close(picture.at(240, 169), [255, 255, 255], 0);
    close(shadow({ color: '#ff0000', opacity: 1 }).at(305, 165), [255, 0, 0], 1);
    close(shadow({ x: -40, y: -20 }).at(175, 105), [128, 128, 128], 1, 'negative offsets:');
  });

  it('blurs by a standard deviation and follows soft alpha', () => {
    const picture = shadow({ x: 0, y: 0, blur: 16 });
    // σ is 4 canvas pixels; d pixels outside the right edge the shadow is 0.5 · Φ(−d / 4) strong.
    for (const d of [1, 4, 8]) {
      const want = 255 * (1 - 0.5 * phi(-(d + 0.5) / 4));
      close(picture.at(300 + d, 135), Array(3).fill(want), 4, `${d} px out:`);
    }
    close(picture.at(300 + 20, 135), [255, 255, 255], 1, 'spent after a few deviations:');
    const half = square(
      [fx('dropShadow', { x: 40, y: 0, blur: 0, opacity: 1 })],
      { fill: '#00ff0080' },
      '#ffffff',
    );
    close(half.at(305, 135), [127, 127, 127], 2, 'a half-transparent layer casts half a shadow:');
  });
});

describe('flicker', () => {
  const params = { mode: 'brightness', amount: 0.5, rate: 10, smooth: false, variant: 3 };
  const time = (t) => ({ t, frame: Math.round(t * 30), age: t, remaining: 4 - t, duration: 4 });

  it('is a level that depends on the time alone', () => {
    assert.equal(flickerLevel(params, time(0.31)), flickerLevel(params, time(0.31)));
    assert.equal(flickerLevel(params, time(0.31)), flickerLevel(params, time(0.39)), 'same step');
    assert.notEqual(flickerLevel(params, time(0.31)), flickerLevel(params, time(0.41)));
    assert.notEqual(
      flickerLevel(params, time(0.31)),
      flickerLevel({ ...params, variant: 4 }, time(0.31)),
    );
    const levels = Array.from({ length: 200 }, (_, i) => flickerLevel(params, time(i / 10)));
    assert.ok(Math.min(...levels) >= 0.5 && Math.max(...levels) <= 1.5);
    assert.ok(Math.max(...levels) - Math.min(...levels) > 0.6, 'uses its range');
    const dim = levels.map((_, i) => flickerLevel({ ...params, mode: 'opacity' }, time(i / 10)));
    assert.ok(Math.max(...dim) <= 1 && Math.min(...dim) >= 0.5, 'opacity only ever drops');
  });

  it('scales the brightness, or the opacity, of the frame by that level', () => {
    const filter = effectModule('flicker').filter;
    assert.equal(filter({ ...params, amount: 0 }, {}, time(1)), '');
    assert.equal(filter(params, {}, time(1)), `brightness(${flickerLevel(params, time(1))})`);
    const edl = (mode) =>
      doc([
        [
          gen(
            's',
            'solid',
            { color: '#646464' },
            { effects: [fx('flicker', { ...params, mode })] },
          ),
        ],
      ]);
    for (const t of [0.05, 1, 2.35]) {
      const want = 100 * flickerLevel(params, time(t));
      close(draw(edl('brightness'), t).at(0.5, 0.5), Array(3).fill(clamp(want)), 1, `${t} s:`);
      const faded = 100 * flickerLevel({ ...params, mode: 'opacity' }, time(t));
      close(draw(edl('opacity'), t).at(0.5, 0.5), Array(3).fill(faded), 1, `opacity ${t} s:`);
    }
    const every = { ...params, rate: 0 };
    assert.notEqual(flickerLevel(every, time(1)), flickerLevel(every, time(1 + 1 / 30)));
  });
});

describe('vignette', () => {
  const shape = { amount: 1, size: 0.5, softness: 0.4 };
  /** Distance of a pixel from the centre, in corner units. */
  const distance = (x, y, roundness = 0) => {
    const half = Math.hypot(480, 270) / 2;
    const rx = (480 / Math.SQRT2) * (1 - roundness) + half * roundness;
    const ry = (270 / Math.SQRT2) * (1 - roundness) + half * roundness;
    return Math.hypot((x + 0.5 - 240) / rx, (y + 0.5 - 135) / ry);
  };

  it('falls off along an S-curve between size − softness / 2 and size + softness / 2', () => {
    assert.equal(vignetteAt(0.3, shape), 0);
    assert.equal(vignetteAt(0.5, shape), 0.5);
    assert.equal(vignetteAt(0.7, shape), 1);
    assert.ok(Math.abs(vignetteAt(0.4, shape) - 0.15625) < 1e-9);
    assert.equal(vignetteAt(0.5, { ...shape, softness: 0 }), 1);
    const frame = flat([fx('vignette', shape)], '#ffffff');
    for (const [x, y] of [
      [240, 135],
      [340, 135],
      [380, 135],
      [410, 135],
      [440, 135],
      [479, 135],
      [240, 20],
      [300, 60],
      [0, 0],
    ]) {
      const want = 255 * (1 - vignetteAt(distance(x, y), shape));
      close(frame.at(x, y), Array(3).fill(want), 3, `${x},${y}:`);
    }
    assert.deepEqual(frame.at(240, 135), [255, 255, 255]);
    assert.deepEqual(frame.at(0, 0), [0, 0, 0]);
  });

  it('follows the frame at roundness 0 and is a circle at 1', () => {
    const round = flat([fx('vignette', { ...shape, roundness: 1 })], '#ffffff');
    for (const [x, y] of [
      [240, 269],
      [380, 135],
      [479, 135],
      [140, 60],
    ]) {
      const want = 255 * (1 - vignetteAt(distance(x, y, 1), shape));
      close(round.at(x, y), Array(3).fill(want), 3, `${x},${y}:`);
    }
    // The same number of pixels from the centre, sideways and downwards: equal on a circle.
    close(round.at(240 + 120, 135), round.at(240, 135 + 120), 2);
    const oval = flat([fx('vignette', shape)], '#ffffff');
    assert.ok(oval.at(240 + 120, 135)[0] > oval.at(240, 135 + 120)[0] + 60, 'not on the oval');
  });

  it('tints by amount in any colour, around any centre, only where the layer is', () => {
    const red = flat([fx('vignette', { ...shape, amount: 0.5, color: '#ff0000' })], '#ffffff');
    close(red.at(0, 0), [255, 128, 128], 2);
    const moved = flat([fx('vignette', { ...shape, center: { x: 0, y: 0 } })], '#ffffff');
    assert.deepEqual(moved.at(0, 0), [255, 255, 255]);
    assert.deepEqual(moved.at(479, 269), [0, 0, 0]);
    const cut = square([fx('vignette', { amount: 1, size: 0.1, softness: 0.1 })], {}, '#3060c0');
    close(cut.at(240, 135), [255, 255, 255], 0, 'the middle of the layer is clear:');
    close(cut.at(295, 160), [0, 0, 0], 2, 'its corner is dark:');
    assert.deepEqual(cut.at(310, 160), [0x30, 0x60, 0xc0], 'what is not layer is untouched');
  });
});
