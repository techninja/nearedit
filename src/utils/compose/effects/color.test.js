import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../../tests/compose/build.js';
import { draw, near, rgb } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';
import { effectModule } from '../catalog.js';
import { channelGains } from './colorBalance.js';
import { levelsCurve } from './levels.js';
import { posterTable } from './posterize.js';

/** A footage frame whose column x is the grey `x × 255 / 479`. */
function rampPlate() {
  const canvas = createCanvas(480, 270);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(480, 270);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.round((((i / 4) % 480) * 255) / 479);
    image.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const plate = rampPlate();
const env = createEnv({ frameOf: () => plate });
const greyAt = (x) => Math.round((x * 255) / 479);
const ramp = (effects) => draw(doc([[media('v', '/m/clip.mp4', { effects })]]), 1, { env });
const flat = (color, effects, background = '#000000') =>
  draw(doc([[gen('s', 'solid', { color }, { effects })]], { background })).at(0.5, 0.5);
const close = (actual, expected, tolerance = 1, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
const clamp = (v) => Math.max(0, Math.min(255, v));
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
/** Alpha and straight colour of a layer's centre, from its picture over black and over white. */
function layerAt(color, effects) {
  const onBlack = flat(color, effects, '#000000');
  const onWhite = flat(color, effects, '#ffffff');
  const alpha = 1 - (onWhite[0] - onBlack[0]) / 255;
  return { alpha, color: onBlack.map((v) => v / alpha) };
}

describe('colorAdjust', () => {
  const filter = (params) =>
    effectModule('colorAdjust').filter({
      brightness: 1,
      exposure: 0,
      contrast: 1,
      saturation: 1,
      hue: 0,
      ...params,
    });

  it('is one chain of filter functions that leaves out what is neutral', () => {
    assert.equal(filter({}), '');
    assert.equal(filter({ brightness: 0.5, exposure: 1 }), '', 'a stop up undoes a halving');
    assert.equal(filter({ exposure: 1 }), 'brightness(2)');
    assert.equal(filter({ contrast: 1.2, hue: 30 }), 'contrast(1.2) hue-rotate(30deg)');
    assert.equal(
      filter({ brightness: 1.5, exposure: -1, contrast: 0.9, saturation: 0, hue: -90 }),
      'brightness(0.75) contrast(0.9) saturate(0) hue-rotate(-90deg)',
    );
  });

  it('multiplies by brightness and by two per stop of exposure', () => {
    const base = [100, 60, 20];
    close(flat('#643c14', [fx('colorAdjust', { brightness: 1.5 })]), [150, 90, 30]);
    close(flat('#643c14', [fx('colorAdjust', { exposure: 1 })]), [200, 120, 40]);
    close(flat('#643c14', [fx('colorAdjust', { exposure: -1 })]), [50, 30, 10]);
    close(flat('#643c14', [fx('colorAdjust', { brightness: 4 })]), [255, 240, 80], 1, 'clamps:');
    close(flat('#643c14', [fx('colorAdjust', { brightness: 0 })]), [0, 0, 0]);
    close(flat('#643c14', []), base, 0);
  });

  it('scales contrast about mid grey, after brightness', () => {
    const want = (v, c) => clamp((v - 127.5) * c + 127.5);
    const picture = ramp([fx('colorAdjust', { contrast: 1.5 })]);
    for (const x of [0, 100, 240, 300, 479]) {
      close(picture.at(x, 100), Array(3).fill(want(greyAt(x), 1.5)), 1, `column ${x}:`);
    }
    const soft = ramp([fx('colorAdjust', { contrast: 0.5 })]);
    close(soft.at(0, 100), [64, 64, 64]);
    close(soft.at(479, 100), [191, 191, 191]);
    const both = flat('#646464', [fx('colorAdjust', { brightness: 2, contrast: 0.5 })]);
    close(both, Array(3).fill(want(200, 0.5)), 1, 'brightness first:');
  });

  it('desaturates to luma and rotates hue as the CSS filters define them', () => {
    const luma = 0.2126 * 200 + 0.7152 * 80 + 0.0722 * 40;
    close(flat('#c85028', [fx('colorAdjust', { saturation: 0 })]), Array(3).fill(luma), 2);
    close(flat('#c85028', [fx('colorAdjust', { saturation: 2 })]), [255, 57, 0], 2);
    close(flat('#c85028', [fx('colorAdjust', { hue: 90 })]), [40, 131, 5], 2);
    close(flat('#c85028', [fx('colorAdjust', { hue: 180 })]), [5, 125, 165], 2);
    close(flat('#808080', [fx('colorAdjust', { hue: 123, saturation: 3 })]), [128, 128, 128], 1);
  });

  it('leaves alpha alone', () => {
    const { alpha, color } = layerAt('#64321980', [fx('colorAdjust', { brightness: 2 })]);
    assert.ok(Math.abs(alpha - 128 / 255) < 0.01, `alpha ${alpha}`);
    close(color, [200, 100, 50], 3);
  });
});

describe('stylize', () => {
  it('turns to grey, to sepia and to the negative, each by an amount', () => {
    const luma = 0.2126 * 200 + 0.7152 * 80 + 0.0722 * 40;
    close(flat('#c85028', [fx('stylize', { grayscale: 1 })]), Array(3).fill(luma), 2);
    const half = [200, 80, 40].map((v) => (v + luma) / 2);
    close(flat('#c85028', [fx('stylize', { grayscale: 0.5 })]), half, 2);
    close(flat('#c85028', [fx('stylize', { invert: 1 })]), [55, 175, 215]);
    close(flat('#c85028', [fx('stylize', { invert: 0.5 })]), [128, 128, 128], 1);
    const sepia = [
      0.393 * 200 + 0.769 * 80 + 0.189 * 40,
      0.349 * 200 + 0.686 * 80 + 0.168 * 40,
      0.272 * 200 + 0.534 * 80 + 0.131 * 40,
    ];
    close(flat('#c85028', [fx('stylize', { sepia: 1 })]), sepia, 2);
  });

  it('applies grayscale, then sepia, then invert', () => {
    const filter = effectModule('stylize').filter;
    assert.equal(filter({ grayscale: 0, sepia: 0, invert: 0 }), '');
    assert.equal(
      filter({ grayscale: 1, sepia: 0.4, invert: 0.2 }),
      'grayscale(1) sepia(0.4) invert(0.2)',
    );
    assert.equal(filter({ grayscale: 0, sepia: 0, invert: 1 }), 'invert(1)');
  });
});

describe('colorBalance', () => {
  it('scales each channel by its gain', () => {
    assert.deepEqual(
      channelGains({ red: 1, green: 1, blue: 1, temperature: 1, tint: 0 }),
      [1.3, 1, 0.7],
    );
    close(flat('#646464', [fx('colorBalance', { temperature: 1 })]), [130, 100, 70], 2);
    close(flat('#646464', [fx('colorBalance', { temperature: -1 })]), [70, 100, 130], 2);
    close(flat('#646464', [fx('colorBalance', { tint: 1 })]), [100, 70, 100], 2);
    close(flat('#646464', [fx('colorBalance', { tint: -0.5 })]), [100, 115, 100], 2);
    close(flat('#646464', [fx('colorBalance', { red: 2, blue: 0.5 })]), [200, 100, 50], 2);
    close(flat('#c8c8c8', [fx('colorBalance', { green: 3 })]), [200, 255, 200], 2, 'clamps:');
    close(flat('#646464', [fx('colorBalance', { red: 0 })]), [0, 100, 100], 1);
  });

  it('leaves alpha alone, soft layers included', () => {
    const { alpha, color } = layerAt('#64646480', [fx('colorBalance', { temperature: 1 })]);
    assert.ok(Math.abs(alpha - 128 / 255) < 0.005, `alpha ${alpha}`);
    close(color, [130, 100, 70], 4);
  });
});

describe('levels', () => {
  const defaults = { black: 0, white: 1, midtones: 0, outBlack: 0, outWhite: 1 };
  const check = (params, tolerance = 2) => {
    const picture = ramp([fx('levels', params)]);
    for (const x of [0, 40, 120, 200, 240, 300, 380, 440, 479]) {
      const want = levelsCurve(greyAt(x) / 255, { ...defaults, ...params }) * 255;
      close(picture.at(x, 50), Array(3).fill(want), tolerance, `${JSON.stringify(params)} @${x}:`);
    }
  };

  it('stretches between the black and the white point', () => {
    check({ black: 0.2 });
    check({ white: 0.6 });
    check({ black: 0.2, white: 0.8 });
    assert.equal(levelsCurve(0.1, { ...defaults, black: 0.2, white: 0.8 }), 0);
    assert.equal(levelsCurve(0.9, { ...defaults, black: 0.2, white: 0.8 }), 1);
    assert.ok(Math.abs(levelsCurve(0.5, { ...defaults, black: 0.2, white: 0.8 }) - 0.5) < 1e-9);
  });

  it('bends the midtones without moving black or white', () => {
    check({ midtones: 1 });
    check({ midtones: -1 });
    check({ midtones: 0.4 });
    assert.equal(levelsCurve(0.5, { ...defaults, midtones: -1 }), 0.25, 'gamma 2 at −1');
    assert.equal(levelsCurve(0.5, { ...defaults, midtones: 1 }), 0.75);
    const lifted = ramp([fx('levels', { midtones: 1 })]);
    close(lifted.at(0, 50), [0, 0, 0], 0);
    close(lifted.at(479, 50), [255, 255, 255], 0);
  });

  it('squeezes the result into the output range, all steps in order', () => {
    check({ outBlack: 0.2, outWhite: 0.9 });
    check({ outBlack: 0.5 });
    check({ black: 0.1, white: 0.9, midtones: -0.5, outBlack: 0.1, outWhite: 0.8 }, 3);
  });

  it('leaves alpha alone', () => {
    const { alpha, color } = layerAt('#80808040', [fx('levels', { outBlack: 0.5 })]);
    assert.ok(Math.abs(alpha - 64 / 255) < 0.005, `alpha ${alpha}`);
    close(color, [191, 191, 191], 6);
  });
});

describe('tint', () => {
  /** The `color` blend mode: hue and saturation of `tint`, lightness of `base` (0..255). */
  function colorize(base, tint) {
    const shift = lum(base) - lum(tint);
    const c = tint.map((v) => v + shift);
    const l = lum(c);
    const low = Math.min(...c);
    const high = Math.max(...c);
    if (low < 0) return c.map((v) => l + ((v - l) * l) / (l - low));
    if (high > 255) return c.map((v) => l + ((v - l) * (255 - l)) / (high - l));
    return c;
  }

  it('colorize takes the hue of the colour and keeps the lightness', () => {
    const amber = rgb('#f59e0b');
    for (const base of ['#808080', '#c85028', '#203860', '#e0e0e0']) {
      const got = flat(base, [fx('tint', { color: '#f59e0b' })]);
      close(got, colorize(rgb(base), amber), 2, `${base}:`);
      assert.ok(Math.abs(lum(got) - lum(rgb(base))) < 2, `${base} changed lightness`);
    }
    close(flat('#000000', [fx('tint')]), [0, 0, 0], 0);
    close(flat('#ffffff', [fx('tint')]), [255, 255, 255], 0);
  });

  it('mixes by the amount', () => {
    const full = colorize([128, 128, 128], rgb('#2563eb'));
    const half = full.map((v) => (v + 128) / 2);
    close(flat('#808080', [fx('tint', { color: '#2563eb', amount: 0.5 })]), half, 2);
  });

  it('duotone maps black to the shadows and white to the highlights', () => {
    const duo = (base, amount = 1) =>
      flat(base, [
        fx('tint', { mode: 'duotone', shadows: '#102060', highlights: '#f0e080', amount }),
      ]);
    close(duo('#000000'), rgb('#102060'));
    close(duo('#ffffff'), rgb('#f0e080'));
    const mid = (l) => [0, 1, 2].map((c) => rgb('#102060')[c] * (1 - l) + rgb('#f0e080')[c] * l);
    close(duo('#808080'), mid(128 / 255), 2);
    close(duo('#c85028'), mid(lum([200, 80, 40]) / 255), 2, 'by lightness, not by colour:');
    const half = mid(128 / 255).map((v) => (v + 128) / 2);
    close(duo('#808080', 0.5), half, 2);
  });

  it('keeps alpha and leaves no fringe on a translucent layer', () => {
    for (const hex of ['#00000080', '#ffffff40', '#40c080c0']) {
      const before = layerAt(hex, []);
      const after = layerAt(hex, [
        fx('tint', { mode: 'duotone', shadows: '#ff0000', highlights: '#00ff00' }),
      ]);
      assert.ok(Math.abs(after.alpha - before.alpha) < 0.005, `${hex} alpha ${after.alpha}`);
      const l = lum(before.color) / 255;
      close(after.color, [255 * (1 - l), 255 * l, 0], 8, `${hex}:`);
    }
  });
});

describe('posterize', () => {
  it('reduces every channel to evenly spaced levels', () => {
    assert.deepEqual(
      [...posterTable(2)].filter((v, i, all) => all.indexOf(v) === i),
      [0, 255],
    );
    assert.deepEqual(
      [...posterTable(4)].filter((v, i, all) => all.indexOf(v) === i),
      [0, 85, 170, 255],
    );
    const picture = ramp([fx('posterize', { levels: 4 })]);
    for (const x of [0, 100, 130, 239, 242, 300, 361, 479]) {
      const want = Math.min(3, Math.floor((greyAt(x) * 4) / 256)) * 85;
      close(picture.at(x, 50), Array(3).fill(want), 0, `column ${x}:`);
    }
    close(flat('#c85028', [fx('posterize', { levels: 2 })]), [255, 0, 0], 0);
  });

  it('leaves alpha alone', () => {
    const { alpha, color } = layerAt('#c8502880', [fx('posterize', { levels: 2 })]);
    assert.ok(Math.abs(alpha - 128 / 255) < 0.005);
    close(color, [255, 0, 0], 2);
  });
});
