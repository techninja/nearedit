import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';
import { grainPixels } from './grain.js';
import { splitChannels, tapsFor } from './lib/channels.js';
import { chromaOf, keptBy, keyPixels } from './lib/chroma.js';

/** A footage frame painted by `paint(ctx)`, the size of the test canvas. */
function plateOf(paint) {
  const canvas = createCanvas(480, 270);
  paint(canvas.getContext('2d'));
  return canvas;
}
let plate;
const env = createEnv({ frameOf: () => plate });
const footage = (picture, effects, background = '#000000') => {
  plate = picture;
  return draw(doc([[media('v', '/m/clip.mp4', { effects })]], { background }), 1, { env });
};
const solid = (color, effects, time = 1, background = '#000000') =>
  draw(doc([[gen('s', 'solid', { color }, { effects })]], { background }), time);
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
const GREEN = [0, 255, 0];

describe('chromaKey', () => {
  const SOFT = [150, 255, 90];
  const CAST = [120, 160, 110];
  /** BT.601: a colour with its chroma moved by `(cb, cr)`. */
  const shifted = ([r, g, b], cb, cr) => [
    r + 1.402 * cr,
    g - 0.344136 * cb - 0.714136 * cr,
    b + 1.772 * cb,
  ];

  it('measures the distance between chromas, whatever the lightness', () => {
    assert.deepEqual(chromaOf(128, 128, 128).map(Math.round), [0, 0]);
    assert.equal(keptBy(GREEN, GREEN, 0.2, 0.2), 0);
    assert.equal(keptBy([255, 255, 255], GREEN, 0.2, 0.2), 1);
    assert.equal(keptBy([20, 20, 20], GREEN, 0.2, 0.2), 1, 'grey is 0.53 from green');
    const k = keptBy(SOFT, GREEN, 0.2, 0.2);
    assert.ok(k > 0.2 && k < 0.8, `the soft edge: ${k}`);
    assert.equal(keptBy(SOFT, GREEN, 0.5, 0.1), 0, 'a wider tolerance takes it');
    assert.equal(keptBy(SOFT, GREEN, 0.05, 0), 1, 'a narrow one leaves it');
  });

  it('keys an array in one pass: removes, keeps, fades, and despills', () => {
    const pixels = [GREEN, [255, 255, 255], SOFT, CAST, [10, 250, 10]];
    const data = new Uint8ClampedArray(pixels.flatMap((p) => [...p, 255]).concat([0, 255, 0, 0]));
    data[7] = 128;
    keyPixels(data, GREEN, 0.2, 0.2, 0);
    const alpha = (i) => data[i * 4 + 3];
    assert.deepEqual([alpha(0), alpha(1), alpha(3), alpha(4), alpha(5)], [0, 128, 255, 0, 0]);
    assert.equal(alpha(2), Math.round(255 * keptBy(SOFT, GREEN, 0.2, 0.2)));
    assert.deepEqual([...data.slice(12, 15)], CAST, 'no spill suppression, no colour change');
    // Spill suppression removes the part of the chroma that points at the key.
    const again = new Uint8ClampedArray([...CAST, 255, 200, 120, 100, 255]);
    keyPixels(again, GREEN, 0.2, 0.2, 1);
    const [kb, kr] = chromaOf(...GREEN);
    const unit = [kb / Math.hypot(kb, kr), kr / Math.hypot(kb, kr)];
    const [cb, cr] = chromaOf(...CAST);
    const towards = cb * unit[0] + cr * unit[1];
    assert.ok(towards > 20, 'the test colour has a green cast');
    close([...again.slice(0, 3)], shifted(CAST, -towards * unit[0], -towards * unit[1]), 1);
    const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
    assert.ok(Math.abs(luma([...again.slice(0, 3)]) - luma(CAST)) < 1, 'lightness stays');
    assert.deepEqual([...again.slice(4, 8)], [200, 120, 100, 255], 'skin has no green to remove');
  });

  it('makes the key colour transparent in a picture and keeps the rest', () => {
    const bands = plateOf((ctx) => {
      [GREEN, [255, 255, 255], SOFT, CAST].forEach(([r, g, b], i) => {
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(i * 120, 0, 120, 270);
      });
    });
    const params = { tolerance: 0.2, softness: 0.2, spill: 0 };
    const picture = footage(bands, [fx('chromaKey', params)], '#ff00ff');
    assert.deepEqual(picture.at(60, 100), [255, 0, 255], 'green is gone: the background shows');
    assert.deepEqual(picture.at(180, 100), [255, 255, 255]);
    assert.deepEqual(picture.at(420, 100), CAST);
    const k = Math.round(255 * keptBy(SOFT, GREEN, 0.2, 0.2)) / 255;
    const over = (c, i) => c * k + [255, 0, 255][i] * (1 - k);
    close(picture.at(300, 100), SOFT.map(over), 2, 'the soft edge is part there:');
    const blue = footage(bands, [fx('chromaKey', { ...params, color: '#ffffff' })], '#ff00ff');
    assert.deepEqual(blue.at(60, 100), GREEN, 'another key leaves green alone');
    assert.deepEqual(blue.at(180, 100), [255, 0, 255], 'and takes its own colour');
  });
});

describe('rgbSplit', () => {
  const bar = plateOf((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(200, 0, 80, 270);
  });

  it('reads red from one side and blue from the other', () => {
    // Distance 40 is 10 canvas pixels: red moves right, blue left, green stays.
    const picture = footage(bar, [fx('rgbSplit', { distance: 40 })]);
    const row = [185, 195, 205, 240, 275, 285, 295].map((x) => picture.at(x, 100).join());
    assert.deepEqual(row, [
      '0,0,0',
      '0,0,255',
      '0,255,255',
      '255,255,255',
      '255,255,0',
      '255,0,0',
      '0,0,0',
    ]);
    const down = footage(bar, [fx('rgbSplit', { distance: 40, angle: 90 })]);
    assert.deepEqual(down.at(240, 100), [255, 255, 255], 'along the bar nothing shows');
    const back = footage(bar, [fx('rgbSplit', { distance: 40, angle: 180 })]);
    assert.deepEqual(
      [back.at(195, 100), back.at(285, 100)],
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
    );
  });

  it('interpolates along the split, so it grows smoothly', () => {
    // Distance 6 is 1.5 canvas pixels: blue reaches half way into the second pixel out.
    const picture = footage(bar, [fx('rgbSplit', { distance: 6 })]);
    close(picture.at(199, 100), [0, 0, 255], 0);
    close(picture.at(198, 100), [0, 0, 128], 1);
    close(picture.at(197, 100), [0, 0, 0], 0);
    close(picture.at(201, 100), [128, 255, 255], 1);
    assert.deepEqual(tapsFor(2.5, 0), { x: 2, y: 0, weights: [128, 128, 0, 0] });
    assert.deepEqual(tapsFor(0, -1.25), { x: 0, y: -2, weights: [64, 0, 192, 0] });
    assert.deepEqual(tapsFor(3, 1), { x: 3, y: 1, weights: [256, 0, 0, 0] });
    assert.equal(
      tapsFor(0.3, 0.7).weights.reduce((sum, w) => sum + w, 0),
      256,
    );
    // A diagonal half-pixel split spreads an edge over both axes.
    const tilted = footage(bar, [fx('rgbSplit', { distance: 8, angle: 45 })]);
    close(tilted.at(198, 100), [0, 0, 112], 2, '7 sixteenths into the bar:');
  });

  it('keeps flat areas as they are: colour, and alpha where it is even', () => {
    for (const color of ['#c85028', '#40c08080', '#ffffff10']) {
      const plain = solid(color, [], 1, '#336699');
      const split = solid(color, [fx('rgbSplit', { distance: 30, angle: 20 })], 1, '#336699');
      assert.ok(Buffer.from(split.data).equals(Buffer.from(plain.data)), color);
    }
  });

  it('gives a fringe the alpha of the channel that made it', () => {
    const from = new Uint8ClampedArray([0, 0, 0, 0, 200, 100, 50, 128, 0, 0, 0, 0]);
    const to = new Uint8ClampedArray(12);
    splitChannels(to, from, 3, 1, 1, 0);
    assert.deepEqual([...to], [0, 0, 50, 128, 0, 100, 0, 128, 200, 0, 0, 128]);
    const half = plateOf((ctx) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(200, 0, 80, 270);
    });
    const picture = footage(half, [fx('rgbSplit', { distance: 40 })], '#ffffff');
    close(picture.at(240, 100), [255, 255, 255], 1, 'white over white, still half there:');
    close(picture.at(285, 100), [255, 127, 127], 2, 'a half-solid red fringe:');
  });
});

describe('grain', () => {
  const grey = (params, time = 1) =>
    solid('#808080', [fx('grain', { amount: 0.5, ...params })], time);
  const stats = (picture, channel = 0) => {
    let sum = 0;
    let squares = 0;
    let steps = 0;
    const n = picture.data.length / 4;
    for (let i = 0; i < n; i++) {
      const v = picture.data[i * 4 + channel];
      sum += v;
      squares += v * v;
      if (i % 480) steps += Math.abs(v - picture.data[(i - 1) * 4 + channel]);
    }
    const mean = sum / n;
    return { mean, deviation: Math.sqrt(squares / n - mean * mean), step: steps / n };
  };
  const same = (a, b) => Buffer.from(a.data).equals(Buffer.from(b.data));

  it('is the same for the same frame and different on the next', () => {
    assert.ok(same(grey({}, 1), grey({}, 1)));
    assert.ok(!same(grey({}, 1), grey({}, 1 + 1 / 30)), 'one frame later the grain has moved');
    assert.ok(
      same(grey({ animated: false }, 1), grey({ animated: false }, 2)),
      'unless it is still',
    );
    assert.ok(!same(grey({}), grey({ variant: 2 })), 'a variant is another pattern');
  });

  it('leaves the level of the picture where it was', () => {
    for (const [color, level] of [
      ['#808080', 128],
      ['#404040', 64],
      ['#c0c0c0', 192],
    ]) {
      for (const time of [0.5, 1, 2.2]) {
        const { mean, deviation } = stats(solid(color, [fx('grain', { amount: 0.5 })], time));
        assert.ok(Math.abs(mean - level) < 0.6, `${color} at ${time} s: mean ${mean}`);
        assert.ok(deviation > 3, `${color} has grain: ${deviation}`);
      }
    }
    assert.equal(stats(solid('#000000', [fx('grain', { amount: 1 })])).deviation, 0);
    assert.equal(stats(solid('#ffffff', [fx('grain', { amount: 1 })])).mean, 255);
  });

  it('grows with amount and size, in grey or in colour', () => {
    const fine = stats(grey({ amount: 0.25, size: 4 }));
    const strong = stats(grey({ amount: 1, size: 4 }));
    assert.ok(strong.deviation > fine.deviation * 3, `${fine.deviation} → ${strong.deviation}`);
    // Size 4 is one canvas pixel per cell here; 16 spreads a cell over four.
    const coarse = stats(grey({ size: 16 }));
    assert.ok(coarse.step < stats(grey({ size: 4 })).step * 0.6, 'bigger grains change slower');
    const mono = grey({});
    assert.equal(
      mono.count((r, g, b) => r !== g || g !== b),
      0,
    );
    const colour = grey({ colored: true });
    assert.ok(colour.count((r, g, b) => r !== g || g !== b) > 100000);
    assert.ok(Math.abs(stats(colour, 2).mean - 128) < 0.6);
  });

  it('touches colour only: alpha stays, and what is not layer stays empty', () => {
    const translucent = (effects, background) => solid('#80808080', effects, 1, background);
    const noisy = [fx('grain', { amount: 1 })];
    const onBlack = translucent(noisy, '#000000');
    const onWhite = translucent(noisy, '#ffffff');
    for (const i of [0, 4000, 250000, 400000]) {
      const alpha = 255 - (onWhite.data[i] - onBlack.data[i]);
      assert.ok(Math.abs(alpha - 128) <= 1, `alpha ${alpha}`);
    }
    assert.ok(stats(onBlack).deviation > 3);
  });

  it('makes its noise from two uniform values per cell, centred on mid grey', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    grainPixels(data, 64, 1, 99, false);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    assert.ok(Math.abs(sum / 4096 - 127.5) < 3, `mean ${sum / 4096}`);
    assert.ok(
      data.every((v, i) => i % 4 === 3 || v === data[i - (i % 4)]),
      'grey',
    );
    const tinted = new Uint8ClampedArray(64 * 64 * 4);
    grainPixels(tinted, 64, 1, 99, true);
    assert.ok(tinted.some((v, i) => i % 4 === 1 && v !== tinted[i - 1]));
    const still = new Uint8ClampedArray(16 * 16 * 4);
    grainPixels(still, 16, 0, 5, false);
    assert.ok(still.every((v, i) => (i % 4 === 3 ? v === 255 : v === 128)));
  });
});
