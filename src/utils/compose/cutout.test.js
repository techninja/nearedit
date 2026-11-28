import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../tests/compose/build.js';
import { createCanvas, createEnv, renderFrame } from '../../api/compose/index.js';
import { blurDeviation, blurFor } from './blurMeasure.js';
import { composeFor } from './host.js';
import { matteCurve } from './matteCurve.js';
import { HARDEST, edgeShape } from './matteEdge.js';

/**
 * The matte pass and the outline effect, measured: a black picture whose
 * matte is a disc with an edge of known softness, over white — so the
 * darkness along a row is exactly how much of it the person covers.
 */

const FILE = '/media/me.mp4';
const [W, H, R] = [640, 360, 100];
const made = {
  ...{ file: '/media/c.mp4', key: '0a51bd39df6c629f93d1', source: FILE, start: 0, end: 4 },
  ...{ fps: 30, width: W, height: H, frames: 120 },
};
/** The share of a normal distribution below `x`. */
function phi(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const p =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const tail = 0.5 * p * Math.exp(-z * z);
  return x < 0 ? tail : 1 - tail;
}
/**
 * A packed frame: `picture` on the left, on the right a disc of radius 100
 * whose edge is a ramp of the deviation a real matte has (0.8 of a pixel of
 * a 512-pixel grid: 1 px at this size).
 */
function packed(picture = [0, 0, 0], sigma = 1, scale = 1) {
  const [w, h] = [W * scale, H * scale];
  const canvas = createCanvas(w * 2, h);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w * 2, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const far = Math.hypot((x + 0.5) / scale - W / 2, (y + 0.5) / scale - H / 2);
      const v = Math.round(255 * phi((R - far) / sigma));
      const i = (y * w * 2 + x) * 4;
      image.data.set([...picture, 255], i);
      image.data.set([v, v, v, 255], i + w * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
const person = (cutout = {}, more = {}) =>
  media('me', FILE, { cutout: { on: true, ...cutout, made }, ...more });
const over = (clip, color = '#ffffff') => doc([[clip], [gen('bg', 'solid', { color })]]);
/** Draw at a width; `row(y)` gives how dark each pixel of a row is, 0..1. */
function shoot(edl, frame, width = 640) {
  const canvas = renderFrame(edl, 1, { width, env: createEnv({ frameOf: () => frame }) });
  const ctx = canvas.getContext('2d');
  const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
  const row = (y) => {
    const { data } = ctx.getImageData(0, y, width, 1);
    return Array.from({ length: width }, (_, x) => 1 - data[x * 4 + 1] / 255);
  };
  return { at, row, covered: (y) => row(y).reduce((sum, v) => sum + v, 0) };
}
const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, want ${expected}`);

describe('the matte curve', () => {
  it('leaves a matte as it is, and keeps black clear and white solid whatever it does', () => {
    assert.deepEqual([...matteCurve(1, 0)], [...Array(256).keys()]);
    for (const [gain, shift] of [[3, 0], [1, 2], [0.5, -1.5], [20, 6], [14, -19]]) {
      const curve = matteCurve(gain, shift);
      assert.deepEqual([curve[0], curve[255]], [0, 255]);
      assert.ok(curve.every((v, i) => i === 0 || v >= curve[i - 1]), 'never falls');
    }
    assert.equal(matteCurve(2, 0.5), matteCurve(2, 0.5), 'a table is made once');
    assert.ok(matteCurve(1, 1)[128] < 128 && matteCurve(1, -1)[128] > 128, 'a shift moves the edge');
    assert.ok(matteCurve(3, 0)[150] > 150 && matteCurve(3, 0)[105] < 105, 'gain steepens it');
  });

  it('measures what the canvas blur really does, and asks for one that is enough', () => {
    const { env } = composeFor(createEnv());
    assert.equal(blurDeviation(0, env), 0);
    // The software canvas blurs in whole-pixel boxes: nothing at all under 0.8 px.
    assert.equal(blurDeviation(0.5, env), 0);
    near(blurDeviation(1, env), 1.08, 0.05, 'asked for 1 px');
    near(blurDeviation(4, env), 4.15, 0.2, 'asked for 4 px');
    near(blurDeviation(30, env) / 30, 1, 0.12, 'a wide blur, made on a reduced copy');
    for (const wanted of [0.3, 0.7, 1.2, 2.2, 5, 11]) {
      const blur = blurFor(wanted, env);
      assert.ok(blur.got >= wanted * 0.9, `${wanted}: got ${blur.got} for ${blur.ask}`);
      assert.ok(blur.got <= Math.max(1.1, wanted * 1.45), `${wanted}: not far more (${blur.got})`);
      assert.equal(blurFor(wanted, env), blur, 'measured once');
    }
  });

  it('blurs a matte only when the edge must be softer or move further than its ramp', () => {
    const { env } = composeFor(createEnv());
    assert.equal(edgeShape(1, 0, 1, env).blur, 0, 'as soft as it is');
    assert.equal(edgeShape(0, 1, 1, env).blur, 0, 'harder, moved within its ramp');
    assert.ok(edgeShape(3, 0, 1, env).blur > 2, 'softer');
    assert.ok(edgeShape(1, 4, 1, env).blur > 2, 'moved further than the ramp reaches');
    assert.ok(edgeShape(1, -4, 1, env).blur > 2, 'either way');
    assert.deepEqual([...edgeShape(1, 0, 1, env).curve], [...matteCurve(1, 0)]);
    assert.equal(edgeShape(0, 0, HARDEST, env).curve, matteCurve(1, 0), 'no harder than a pixel');
  });
});

describe('the matte pass', () => {
  it('shows the picture where the matte is white and what is behind where it is black', () => {
    const seen = shoot(over(person({ shrink: 0 })), packed([200, 40, 30]));
    assert.deepEqual(seen.at(320, 180), [200, 40, 30], 'the person');
    assert.deepEqual(seen.at(320, 60), [255, 255, 255], 'the background is gone');
    assert.deepEqual(seen.at(20, 340), [255, 255, 255]);
    // The disc is 200 px across where it is widest, and its edge stays where the matte has it.
    near(shoot(over(person({ shrink: 0 })), packed()).covered(180), 200, 0.5, 'width');
    const plain = shoot(over(person()), createCanvas(W, H));
    assert.deepEqual(plain.at(20, 340), [0, 0, 0], 'a plain frame is drawn as the plain picture');
    const waiting = media('me', FILE, { cutout: { on: true } });
    assert.deepEqual(shoot(over(waiting), packed()).at(900 % 640, 20), [0, 0, 0], 'no cutout yet');
  });

  it('moves the edge by `shrink` units, in or out, at any size it is drawn at', () => {
    const frame = packed();
    // A unit is a hundredth of the picture's shorter side: 3.6 px of this one.
    for (const width of [480, 640, 1280]) {
      const k = width / 640;
      const base = shoot(over(person({ shrink: 0 })), frame, width).covered(180 * k);
      for (const shrink of [0.2, 0.5, 1, 3, -0.5, -2]) {
        const moved = (base - shoot(over(person({ shrink })), frame, width).covered(180 * k)) / 2;
        const want = shrink * 3.6 * k;
        near(moved, want, 0.12 * Math.abs(want) + 0.15, `shrink ${shrink} at ${width} px`);
      }
    }
  });

  it('draws the edge as soft as `feather` asks, without moving it', () => {
    const frame = packed();
    /** Width of the edge's ramp from 10 % to 90 %, pixels. */
    const ramp = (feather) => {
      const row = shoot(over(person({ feather, shrink: 0 })), frame).row(180).slice(320);
      return row.filter((v) => v > 0.1 && v < 0.9).length;
    };
    assert.ok(ramp(0) <= 2, `hard: ${ramp(0)} px`);
    // 0.8 of the ramp's full width lies between 10 % and 90 %: about feather × 3.6 px.
    near(ramp(1), 3.6, 1.6, 'feather 1');
    near(ramp(4), 14.4, 4, 'feather 4');
    for (const feather of [0, 0.4, 1, 4]) {
      const edl = over(person({ feather, shrink: 0 }));
      near(shoot(edl, frame).covered(180), 200, 0.8, `feather ${feather} keeps the width`);
    }
  });

  it('draws the same person from a frame FFmpeg reduced, and from a matte read at a reduced size', () => {
    const full = shoot(over(person({ shrink: 0.5 })), packed(), 320).covered(90);
    const half = shoot(over(person({ shrink: 0.5 })), packed([0, 0, 0], 0.5, 0.5), 320).covered(90);
    near(half, full, 0.6, 'half-size frame');
    // A soft edge is made on a matte of half or a quarter of the size: the person stays the same.
    const soft = shoot(over(person({ feather: 3, shrink: 1 })), packed(), 1280).covered(360) / 2;
    near(soft, 200 - 2 * 3.6, 1.2, 'reduced matte');
  });

  it('keeps the whole picture, blurred, behind the person in blur mode', () => {
    const frame = packed();
    const fctx = frame.getContext('2d');
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, W / 2, H); // the picture: white left, black right
    const seen = shoot(over(person({ mode: 'blur', blur: 4 }), '#ff0000'), frame);
    assert.deepEqual(seen.at(20, 20), [255, 255, 255], 'the picture, not what is behind the clip');
    assert.deepEqual(seen.at(620, 340), [0, 0, 0]);
    const [left, right] = [seen.at(308, 30)[0], seen.at(332, 30)[0]];
    assert.ok(left < 250 && left > right && right > 5, `the background is soft: ${left}, ${right}`);
    assert.deepEqual([seen.at(300, 180)[0], seen.at(340, 180)[0]], [255, 0], 'the person is sharp');
  });

  it('is a layer like any other: transform, opacity and effects apply to the person', () => {
    const frame = packed();
    const small = person({ shrink: 0 }, { transform: { scaleX: 0.5, scaleY: 0.5, x: 300 } });
    const moved = shoot(over(small), frame);
    near(moved.covered(180), 100, 0.6, 'half the size');
    assert.deepEqual([moved.at(420, 180), moved.at(320, 180)], [[0, 0, 0], [255, 255, 255]]);
    const faded = shoot(over(person({}, { transform: { opacity: 0.5 } })), frame).at(320, 180);
    near(faded[0], 128, 1, 'half opaque');
    const shadow = [fx('dropShadow', { x: 120, y: 0, blur: 0, color: '#ff0000', opacity: 1 })];
    const cast = shoot(over(person({}, { effects: shadow })), frame);
    assert.deepEqual(cast.at(320 + 100 + 30, 180), [255, 0, 0], 'the shadow has the person’s shape');
    assert.deepEqual(cast.at(320 + 100 + 30, 60), [255, 255, 255], 'not the picture’s');
  });
});

describe('outline', () => {
  /** Red beyond the edge of a black shape on white, in pixels, per side. */
  const border = (params, width = 480, shape = { shape: 'rectangle', width: 0.3, height: 0.4 }) => {
    const effects = [fx('outline', { color: '#ff0000', ...params })];
    const edl = over(gen('s', 'shape', { ...shape, fill: '#000000' }, { effects }));
    const canvas = renderFrame(edl, 1, { width, env: createEnv() });
    const { data } = canvas.getContext('2d').getImageData(0, (width * 9) / 32, width, 1);
    let red = 0;
    for (let x = 0; x < width; x++) red += (data[x * 4] - data[x * 4 + 1]) / 255;
    return red / 2;
  };

  it('is as wide as asked, in units of the frame, at any canvas size', () => {
    // A unit is a hundredth of the frame's shorter side: 2.7 px of a 480 × 270 canvas.
    for (const wide of [0.4, 0.8, 1.5, 3, 8]) {
      for (const width of [480, 960, 1920]) {
        const got = border({ width: wide }, width) / (width / 480);
        near(got, wide * 2.7, 0.06 * wide * 2.7 + 0.12, `width ${wide} at ${width} px`);
      }
    }
    assert.equal(border({ width: 0 }), 0);
  });

  it('follows the shape, takes its colour’s alpha, and fades when soft', () => {
    const around = (params) => {
      const effects = [fx('outline', { color: '#ff0000', width: 4, ...params })];
      const disc = { shape: 'ellipse', width: 200, height: 200, fill: '#000000' };
      const canvas = renderFrame(over(gen('s', 'shape', disc, { effects })), 1, {
        ...{ width: 480, env: createEnv() },
      });
      const ctx = canvas.getContext('2d');
      return (x, y) => [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)];
    };
    // The disc is 25 px in radius on this canvas, its border 10.8 px more.
    const at = around({});
    assert.deepEqual(at(240, 135), [0, 0, 0], 'the layer is on top');
    for (const [dx, dy] of [[31, 0], [0, 31], [-22, 22], [22, -22]])
      assert.deepEqual(at(240 + dx, 135 + dy), [255, 0, 0], `round the disc at ${dx}, ${dy}`);
    assert.deepEqual(at(240 + 40, 135), [255, 255, 255], 'and no further');
    assert.deepEqual(at(240 + 28, 135 + 28), [255, 255, 255], 'a round border, not a square one');
    near(around({ color: '#ff000080' })(271, 135)[1], 127, 2, 'half transparent');
    const soft = around({ softness: 1 });
    const fade = [soft(240 + 30, 135)[1], soft(240 + 36, 135)[1], soft(240 + 42, 135)[1]];
    assert.ok(fade[0] < fade[1] && fade[1] < fade[2] && fade[1] > 40 && fade[1] < 215, `${fade}`);
  });
});
