import { before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { doc, gen } from '../../../../../tests/compose/build.js';
import { draw, near } from '../../../../../tests/compose/pixels.js';
import { createEnv } from '../../../../api/compose/index.js';
import { composeFor } from '../../host.js';
import { SHAPES, SPRITES } from './shapes.js';
import { MAX_ENTRIES, MAX_PIXELS, cacheFor } from './spriteCache.js';

const FLAG = '/media/flag.png';
const BACK = [0x10, 0x20, 0x30];
/** One particle in the middle of the frame that does not move, vary or fade. */
const ONE = {
  rate: 0,
  burst: 1,
  speed: 0,
  speedJitter: 0,
  sizeJitter: 0,
  lifetime: 4,
  lifetimeJitter: 0,
  fadeIn: 0,
  fadeOut: 0,
  colors: 1,
  blend: 'normal',
};
const scene = (params) =>
  doc([[gen('p', 'particles', { ...ONE, ...params })]], { background: '#102030' });
/** Far from the background colour. */
const lit = (r, g, b) => Math.abs(r - 0x10) + Math.abs(g - 0x20) + Math.abs(b - 0x30) > 120;
const extent = (frame, test = lit) => {
  const box = frame.bounds(test);
  return box ? [box.right - box.left + 1, box.bottom - box.top + 1] : [0, 0];
};
const close = (actual, expected, tolerance, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} got ${actual}, want ${expected}`);

/** @type {Map<string, any>} */
let images;
let flag;

/** An 80 × 40 picture: red left half, blue right half, a transparent hole and corner. */
async function flagImage(left = '#ff0000') {
  const canvas = createCanvas(80, 40);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, 40, 40);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(40, 0, 40, 40);
  ctx.clearRect(0, 0, 12, 12);
  ctx.clearRect(34, 14, 12, 12);
  return loadImage(canvas.toBuffer('image/png'));
}

before(async () => {
  flag = await flagImage();
  images = new Map([[FLAG, flag]]);
});

describe('an image as the sprite', () => {
  // At 320 output px the picture is drawn 80 × 40 canvas px: its own size.
  const pictured = { sprite: 'image', image: FLAG, size: 320 };
  const shot = (params, time = 1) => draw(scene({ ...pictured, ...params }), time, { images });

  it('keeps its own colours and its transparency', () => {
    const frame = shot({});
    assert.deepEqual(frame.at(220, 140), [255, 0, 0], 'left half');
    assert.deepEqual(frame.at(262, 140), [0, 0, 255], 'right half');
    assert.deepEqual(frame.at(240, 135), BACK, 'the hole shows what is behind');
    assert.deepEqual(frame.at(204, 119), BACK, 'so does the cut corner');
    assert.deepEqual(frame.at(204, 150), [255, 0, 0], 'the other corners are there');
    assert.deepEqual(frame.at(150, 135), BACK);
    assert.deepEqual(extent(frame), [80, 40], 'sized by its longer side, in proportion');
    assert.deepEqual(extent(shot({ size: 160 })), [40, 20]);
  });

  it('is tinted with the particle colour by the tint amount, inside its own outline', () => {
    const full = shot({ tint: 1, color1: '#00ff00' });
    assert.deepEqual(full.at(220, 140), [0, 255, 0]);
    assert.deepEqual(full.at(262, 140), [0, 255, 0]);
    assert.deepEqual(full.at(240, 135), BACK, 'the hole stays a hole');
    const half = shot({ tint: 0.5, color1: '#00ff00' });
    assert.ok(
      near(half.at(220, 140), [128, 128, 0], 2),
      `half red, half green: ${half.at(220, 140)}`,
    );
    assert.ok(near(half.at(262, 140), [0, 128, 128], 2));
    // Colour over life tints over life.
    const turning = { tint: 1, colors: 2, color1: '#ffffff', color2: '#000000' };
    assert.ok(shot(turning, 0.01).at(220, 140)[0] > 250);
    assert.ok(near(shot(turning, 2).at(220, 140), [128, 128, 128], 6));
  });

  it('turns: rotation, spin and alignment to the direction of travel', () => {
    const upright = shot({ rotation: 90 });
    assert.deepEqual(extent(upright), [40, 80]);
    assert.deepEqual(upright.at(240, 115), [255, 0, 0], 'the left end is now at the top');
    assert.deepEqual(upright.at(240, 160), [0, 0, 255]);
    assert.deepEqual(extent(shot({ spin: 45 }, 2)), [40, 80], '45°/s for two seconds');
    const [w, h] = extent(shot({ rotation: 45 }));
    close(w, 85, 2, 'on the diagonal it is (80 + 40) / √2 wide:');
    close(h, 76, 2, 'and as tall, less the cut corner, which now points up:');
    // The sprite's top points where it travels: heading right turns it a quarter clockwise.
    const flying = { speed: 40, direction: 90, spread: 0, align: true };
    assert.deepEqual(extent(shot(flying)), [40, 80]);
    assert.deepEqual(extent(shot({ ...flying, direction: 0 })), [80, 40]);
  });

  it('draws nothing, and does not fail, while the image is missing or not loaded', () => {
    const warn = mock.method(console, 'warn', () => {});
    const blank = (frame) =>
      frame.count((r, g, b) => r !== BACK[0] || g !== BACK[1] || b !== BACK[2]);
    assert.equal(blank(shot({ image: '/media/nowhere.png' })), 0, 'unknown path');
    assert.equal(blank(shot({ image: '' })), 0, 'no path');
    assert.equal(blank(draw(scene(pictured), 1)), 0, 'a host without images');
    // The same environment, before and after the picture arrives.
    const arriving = new Map();
    const env = createEnv({ images: arriving });
    assert.equal(blank(draw(scene(pictured), 1, { env })), 0, 'not loaded yet');
    arriving.set(FLAG, flag);
    assert.deepEqual(draw(scene(pictured), 1, { env }).at(220, 140), [255, 0, 0], 'loaded');
    assert.equal(warn.mock.callCount(), 0, 'and nothing was reported as a failure');
    warn.mock.restore();
  });

  it('follows the picture when a path gets a new one', async () => {
    const swapping = new Map([[FLAG, flag]]);
    const env = createEnv({ images: swapping });
    assert.deepEqual(draw(scene(pictured), 1, { env }).at(220, 140), [255, 0, 0]);
    swapping.set(FLAG, await flagImage('#ffff00'));
    assert.deepEqual(draw(scene(pictured), 1, { env }).at(220, 140), [255, 255, 0]);
  });
});

describe('built-in sprites', () => {
  const big = (sprite, params = {}) => draw(scene({ sprite, size: 400, ...params }), 1);

  it('fit the box they are sized by', () => {
    for (const sprite of SPRITES) {
      const { w, h } = SHAPES[sprite];
      const soft = sprite === 'dot' || sprite === 'spark';
      const [width, height] = extent(big(sprite), (r) => r > (soft ? 0x10 + 2 : 0x10 + 100));
      assert.ok(
        width <= 100 * w + 1 && height <= 100 * h + 1,
        `${sprite} spills: ${width}×${height}`,
      );
      // A star on two points is 0.905 of its circle tall, a six-armed flake 0.87 wide.
      const least = soft ? 0.8 : sprite === 'star' || sprite === 'snowflake' ? 0.85 : 0.93;
      assert.ok(width >= 100 * w * least - 1, `${sprite} is ${width} wide of ${100 * w}`);
      assert.ok(height >= 100 * h * least - 1, `${sprite} is ${height} tall of ${100 * h}`);
    }
  });

  it('take the particle colour and leave the rest of their box transparent', () => {
    const star = big('star', { color1: '#ff8000' });
    assert.deepEqual(star.at(240, 135), [255, 128, 0]);
    assert.deepEqual(star.at(195, 180), BACK, 'between two points of the star');
    assert.deepEqual(big('ring').at(240, 135), BACK, 'a ring is hollow');
    assert.deepEqual(big('circle').at(240, 135), [255, 255, 255]);
  });

  it('stay crisp at every size, whatever was drawn before', () => {
    const env = createEnv();
    draw(scene({ sprite: 'circle', size: 12 }), 1, { env });
    for (const size of [1600, 640, 96]) {
      const frame = draw(scene({ sprite: 'circle', size }), 1, { env });
      const row = Array.from({ length: 240 }, (_, x) => frame.at(x, 135)[0]);
      const edge = row.filter((r) => r > 0x10 + 12 && r < 243).length;
      assert.ok(edge <= 2, `a ${size} px circle has an edge ${edge} px wide`);
      close(row.filter((r) => r >= 243).length, size / 8, 1.5, `radius of a ${size} px circle:`);
    }
  });

  it('are as bright in a small preview as in the full-size render', () => {
    const dust = { ...ONE, burst: 400, emitter: 'box', emitterWidth: 0.9, emitterHeight: 0.9 };
    for (const [sprite, size] of [
      ['dot', 6],
      ['dot', 20],
      ['star', 14],
      ['circle', 5],
    ]) {
      const edl = doc([[gen('p', 'particles', { ...dust, sprite, size })]]);
      const light = (width) => {
        const frame = draw(edl, 1, { width, height: (width * 9) / 16 });
        let sum = 0;
        for (let i = 0; i < frame.data.length; i += 4) sum += frame.data[i];
        return sum / (width * width);
      };
      const [preview, render] = [light(480), light(1920)];
      close(preview / render, 1, 0.03, `${sprite} of ${size} px, preview over render:`);
    }
  });

  it('turn, tumble and stretch', () => {
    const paper = { sprite: 'confetti', size: 200 };
    const flat = extent(draw(scene(paper), 1));
    const turned = extent(draw(scene({ ...paper, rotation: 90 }), 1));
    close(flat[0], 50, 1, 'paper is 200 output px wide:');
    close(flat[1], 30, 1, 'and 0.6 of that tall:');
    close(turned[0], 30, 2, 'a quarter turn swaps them:');
    close(turned[1], 50, 2);
    const heights = [];
    for (let time = 0.05; time < 2; time += 0.05) {
      const [width, height] = extent(draw(scene({ ...paper, flip: 1 }), time));
      if (height > 0) close(width, 50, 2, 'tumbling leaves the width alone:');
      heights.push(height);
    }
    assert.ok(Math.max(...heights) >= 29 && Math.min(...heights) <= 6, `heights ${heights}`);
    // A 40 px circle at 1000 px/s, stretched by a tenth of a second of travel: 140 × 40.
    const streak = {
      sprite: 'circle',
      size: 40,
      speed: 1000,
      direction: 90,
      spread: 0,
      stretch: 0.1,
    };
    const [long, thick] = extent(draw(scene({ ...streak, position: { x: 0.2, y: 0.5 } }), 0.5));
    close(long, 35, 1.5);
    close(thick, 10, 1);
  });
});

describe('the sprite cache', () => {
  it('is bounded however many colours and sizes pass through it', () => {
    const env = createEnv();
    for (let i = 0; i < 400; i++) {
      const color1 = `#${(i * 40503).toString(16).padStart(6, '0').slice(-6)}`;
      draw(scene({ sprite: 'heart', size: 40 + (i % 7) * 90, color1 }), 1, { env });
    }
    const { entries, pixels } = cacheFor(composeFor(env).env).stats();
    assert.ok(entries <= MAX_ENTRIES && entries > 10, `${entries} canvases cached`);
    assert.ok(pixels <= MAX_PIXELS, `${pixels} pixels cached`);
  });
});
