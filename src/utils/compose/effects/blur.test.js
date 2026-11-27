import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';
import { EFFECTS, effectModule } from '../catalog.js';
import { filterInPlace } from '../filterPass.js';
import { composeFor } from '../host.js';
import { gaussianBlur } from './blur.js';
import { streakSteps } from './lib/directional.js';
import { reduce, reduceLevel } from './lib/reduce.js';

/** A footage frame: black left half, white right half. */
function halves(vertical = false) {
  const canvas = createCanvas(480, 270);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 480, 270);
  ctx.fillStyle = '#ffffff';
  if (vertical) ctx.fillRect(0, 135, 480, 135);
  else ctx.fillRect(240, 0, 240, 270);
  return canvas;
}

let plate = halves();
const env = createEnv({ frameOf: () => plate });
const footage = (effects, picture = halves()) => {
  plate = picture;
  return draw(doc([[media('v', '/m/clip.mp4', { effects })]]), 1, { env });
};
const square = (effects, params = {}, background = '#000000') =>
  draw(
    doc([[gen('s', 'shape', { width: 0.25, height: 0.25, ...params }, { effects })]], {
      background,
    }),
  );
const flat = (effects, color = '#646464') =>
  draw(doc([[gen('s', 'solid', { color }, { effects })]]));
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
/** The normal distribution's cumulative function. */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail =
    0.3989423 *
    Math.exp((-z * z) / 2) *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - tail : tail;
}

describe('blur: gaussian', () => {
  it('is an apply effect with two kinds; radius is in output pixels', () => {
    assert.equal(EFFECTS.find((e) => e.type === 'blur').kind, 'apply');
    assert.deepEqual(effectModule('blur').params.kind.options, ['gaussian', 'directional']);
    // On the 480-pixel canvas of a 1920 document a radius of 16 is 4 canvas pixels.
    const picture = footage([fx('blur', { radius: 16 })]);
    for (const d of [-8, -4, -2, 0, 2, 4, 8]) {
      const want = 255 * phi((d + 0.5) / 4);
      close(picture.at(240 + d, 100), Array(3).fill(want), 6, `${d} px from the edge:`);
    }
  });

  it('halves the picture for wide blurs: σ stays 6 to 12 pixels of the copy', () => {
    assert.deepEqual(
      [0, 3, 11.9, 12, 23.9, 24, 47, 48, 200, 5000].map((s) => reduceLevel(s)),
      [0, 0, 0, 1, 1, 2, 2, 3, 5, 8],
    );
    assert.equal(reduceLevel(4, 2), 1);
    assert.equal(reduceLevel(NaN), 0);
    // The reduced path draws the same Gaussian edge: radius 96 is σ 24 on this canvas, 2 halvings.
    const picture = footage([fx('blur', { radius: 96 })]);
    for (const d of [-48, -24, -12, 0, 12, 24, 48]) {
      const want = 255 * phi((d + 0.5) / 24);
      close(picture.at(240 + d, 100), Array(3).fill(want), 5, `${d} px from the edge:`);
    }
  });

  it('gives the picture the direct filter gives, within a few levels', () => {
    const { pool, env: modules } = composeFor(createEnv());
    pool.begin(480, 270);
    const scene = () => {
      const surface = pool.acquire();
      const ctx = surface.ctx;
      const sky = ctx.createLinearGradient(0, 0, 480, 270);
      sky.addColorStop(0, '#0ea5e9');
      sky.addColorStop(1, '#be123c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 480, 270);
      ctx.fillStyle = '#ffffff';
      for (let x = 40; x < 300; x += 24) ctx.fillRect(x, 60, 8, 120);
      ctx.clearRect(330, 150, 90, 70);
      return surface;
    };
    const flatten = (surface) => {
      const out = pool.acquire();
      out.ctx.fillStyle = '#808080';
      out.ctx.fillRect(0, 0, 480, 270);
      out.ctx.drawImage(surface.canvas, 0, 0);
      return out.ctx.getImageData(0, 0, 480, 270).data;
    };
    for (const sigma of [12, 20, 40, 70]) {
      const direct = scene();
      filterInPlace(direct, `blur(${sigma}px)`, sigma * 3, modules);
      const reduced = scene();
      gaussianBlur(reduced, sigma, modules);
      const a = flatten(direct);
      const b = flatten(reduced);
      let worst = 0;
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        worst = Math.max(worst, Math.abs(a[i] - b[i]));
        sum += Math.abs(a[i] - b[i]);
      }
      assert.ok(
        worst <= 8 && sum / a.length < 1,
        `σ ${sigma}: max ${worst}, mean ${sum / a.length}`,
      );
    }
  });

  it('halves exactly, repeating the edge where the size does not divide', () => {
    const { pool, env: modules } = composeFor(createEnv());
    pool.begin(30, 18);
    const surface = pool.acquire();
    surface.ctx.fillStyle = '#c86432';
    surface.ctx.fillRect(0, 0, 30, 18);
    const { surface: small, factor } = reduce(surface, 3, modules);
    assert.deepEqual([small.width, small.height, factor], [4, 3, 8]);
    const data = small.ctx.getImageData(0, 0, 4, 3).data;
    for (let i = 0; i < data.length; i += 4) {
      assert.deepEqual([...data.slice(i, i + 4)], [200, 100, 50, 255], 'no half-covered border');
    }
    assert.equal(reduce(surface, 0, modules).surface, surface);
  });

  it('keeps a picture that fills the frame solid to its edges, on every path', () => {
    for (const radius of [16, 60, 200]) {
      const frame = flat([fx('blur', { radius })]);
      assert.equal(
        frame.count((r, g, b) => r !== 100 || g !== 100 || b !== 100),
        0,
        `radius ${radius}`,
      );
    }
  });

  it('softens edges, spreads past the layer and keeps far corners transparent', () => {
    const sharp = square([]);
    const soft = square([fx('blur', { radius: 40 })]);
    assert.deepEqual(sharp.at(0.36, 0.5), [0, 0, 0]);
    const outside = soft.at(0.36, 0.5)[0];
    const inside = soft.at(0.39, 0.5)[0];
    assert.ok(outside > 20 && outside < inside && inside < 250, `${outside} then ${inside}`);
    for (const [x, y] of [
      [0, 0],
      [479, 269],
      [0.5, 0],
    ]) {
      close(soft.at(x, y), [0, 0, 0], 0);
    }
  });
});

describe('blur: directional', () => {
  it('smears along the angle only', () => {
    // Radius 64 is 16 canvas pixels each way: a vertical edge becomes a 32-pixel ramp.
    const along = footage([fx('blur', { kind: 'directional', radius: 64 })]);
    for (const d of [-20, -16, -8, 0, 8, 16, 20]) {
      const want = 255 * Math.max(0, Math.min(1, 0.5 + (d + 0.5) / 32));
      close(along.at(240 + d, 100), Array(3).fill(want), 8, `${d} px from the edge:`);
    }
    // The same streak along a horizontal edge changes nothing: it stays one pixel sharp.
    const across = footage([fx('blur', { kind: 'directional', radius: 64 })], halves(true));
    close(across.at(100, 134), [0, 0, 0], 0);
    close(across.at(100, 135), [255, 255, 255], 0);
    const turned = footage(
      [fx('blur', { kind: 'directional', radius: 64, angle: 90 })],
      halves(true),
    );
    close(turned.at(100, 135 + 8), Array(3).fill(255 * 0.75), 8, 'angle 90 blurs down the frame:');
    close(turned.at(100, 100), [0, 0, 0], 0);
  });

  it('never drifts: a flat colour stays exactly itself, an opaque picture opaque', () => {
    for (const color of ['#653321', '#010203', '#fefdfc']) {
      const frame = flat([fx('blur', { kind: 'directional', radius: 150, angle: 33 })], color);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      assert.equal(
        frame.count((pr, pg, pb) => pr !== r || pg !== g || pb !== b),
        0,
        color,
      );
    }
  });

  it('is built from whole-pixel pairs that double the reach', () => {
    const { pairs, pad } = streakSteps(16, 0);
    assert.deepEqual(
      pairs.map(([, [x, y]]) => [Math.abs(x), y]),
      [
        [1, 0],
        [1, 0],
        [1, 0],
        [2, 0],
        [4, 0],
        [8, 0],
      ],
    );
    assert.equal(pad, 16);
    const longer = streakSteps(21, 0);
    assert.equal(longer.pad, 21, 'a last pair brings the streak to its exact length');
    assert.deepEqual(longer.pairs.at(-1)[0], [5, 0]);
    const tilted = streakSteps(40, 30).pairs.flat();
    assert.ok(tilted.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y)));
    assert.deepEqual(streakSteps(40, 90).pairs.at(-1)[0], [0, 8]);
  });
});
