import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createCanvas, createEnv } from '../../../api/compose/index.js';

/** A footage frame painted by `paint(ctx)`, the size of the test canvas. */
function plateOf(paint) {
  const canvas = createCanvas(480, 270);
  paint(canvas.getContext('2d'));
  return canvas;
}
const quadrants = plateOf((ctx) => {
  ['#ff0000', '#00ff00', '#0000ff', '#ffffff'].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect((i % 2) * 240, Math.floor(i / 2) * 135, 240, 135);
  });
});
const halves = plateOf((ctx) => {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 480, 270);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(240, 0, 240, 270);
});
const card = plateOf((ctx) => {
  const ramp = ctx.createLinearGradient(0, 0, 480, 270);
  ramp.addColorStop(0, '#102040');
  ramp.addColorStop(1, '#f0d080');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, 480, 270);
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(70, 40, 9, 200);
  ctx.beginPath();
  ctx.arc(330, 150, 60, 0, 7);
  ctx.fill();
});

let plate = card;
const env = createEnv({ frameOf: () => plate });
const footage = (picture, effects, time = 1) => {
  plate = picture;
  return draw(doc([[media('v', '/m/clip.mp4', { effects })]]), time, { env });
};
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
const about = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, want ${expected}`);
describe('pixelate', () => {
  // Size 80 is 20 canvas pixels; the grid is centred, so rows start at −5, 15, 35…
  const blockAt = (picture, column, row) => picture.at(column * 20 + 10, row * 20 + 5);

  it('gives every block one flat colour, on a grid centred on the frame', () => {
    const picture = footage(card, [fx('pixelate', { size: 80 })]);
    const colours = new Set();
    for (let row = 0; row < 14; row++) {
      for (let column = 0; column < 24; column++) {
        const want = blockAt(picture, column, row);
        colours.add(want.join());
        for (const [dx, dy] of [
          [0, 0],
          [19, 0],
          [0, 19],
          [19, 19],
          [7, 13],
        ]) {
          const y = row * 20 - 5 + dy;
          if (y < 0 || y > 269) continue;
          assert.deepEqual(picture.at(column * 20 + dx, y), want, `block ${column},${row}`);
        }
      }
    }
    assert.ok(colours.size > 100, `only ${colours.size} colours`);
    assert.equal(new Set(picture.data.filter((_, i) => i % 4 === 3)).size, 1, 'still opaque');
  });

  it('shows the average around the middle of each block', () => {
    const edge = footage(halves, [fx('pixelate', { size: 80 })]);
    assert.equal(
      edge.count((r) => r !== 0 && r !== 255),
      0,
      'an edge on the grid stays an edge',
    );
    for (const size of [20, 52, 80, 130]) {
      const picture = footage(halves, [fx('pixelate', { size })]);
      assert.deepEqual(
        [picture.at(239, 100), picture.at(240, 100)].flat(),
        [0, 0, 0, 255, 255, 255],
      );
    }
    const ramp = plateOf((ctx) => {
      const grey = ctx.createLinearGradient(0, 0, 480, 0);
      grey.addColorStop(0, '#000000');
      grey.addColorStop(1, '#ffffff');
      ctx.fillStyle = grey;
      ctx.fillRect(0, 0, 480, 270);
    });
    const picture = footage(ramp, [fx('pixelate', { size: 80 })]);
    for (const column of [0, 5, 11, 12, 23]) {
      const want = ((column * 20 + 10) / 480) * 255;
      close(blockAt(picture, column, 6), Array(3).fill(want), 6, `column ${column}:`);
    }
  });

  it('pixelates alpha with the picture', () => {
    const edl = doc(
      [
        [
          gen(
            's',
            'shape',
            { width: 0.25, height: 0.2 },
            { effects: [fx('pixelate', { size: 160 })] },
          ),
        ],
      ],
      { background: '#ff0000' },
    );
    const picture = draw(edl);
    // 40-pixel blocks; the 120 × 54 shape covers one row of blocks partly, three columns fully.
    assert.deepEqual(picture.at(100, 135), [255, 0, 0], 'outside stays empty');
    assert.deepEqual(picture.at(220, 20), [255, 0, 0]);
    const inside = picture.at(240, 130);
    assert.ok(inside[1] > 150 && inside[1] === inside[2], `a partly covered block: ${inside}`);
    assert.deepEqual(picture.at(205, 100), picture.at(235, 130), 'one block, one value');
  });
});

describe('scanlines', () => {
  const lines = (params, time = 1) =>
    footage(
      plateOf((ctx) => ctx.fillRect(0, 0, 480, 270)),
      [fx('scanlines', { spacing: 40, color: '#ffffff', opacity: 1, ...params })],
      time,
    );
  const rows = (picture, from, to, x = 100) =>
    Array.from({ length: to - from }, (_, i) => picture.at(x, from + i)[0]);

  it('draws lines of the spacing and thickness given, from the centre out', () => {
    // Spacing 40 is 10 canvas pixels, half of it line.
    const picture = lines({});
    assert.deepEqual(rows(picture, 125, 145), [
      ...Array(5).fill(255),
      ...Array(5).fill(0),
      ...Array(5).fill(255),
      ...Array(5).fill(0),
    ]);
    about(picture.count((r) => r === 255) / (480 * 270), 0.5, 0.01, 'half the frame is line');
    assert.deepEqual(rows(lines({ thickness: 0.2 }), 135, 145), [255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    close(lines({ opacity: 0.5, color: '#ff0000' }).at(100, 136), [128, 0, 0], 1);
  });

  it('turns with the angle and rolls with time', () => {
    const upright = lines({ angle: 90 });
    assert.deepEqual(
      [230, 236, 242].map((x) => upright.at(x, 50)[0]),
      [0, 255, 0],
    );
    // 20 px/s is 5 canvas pixels in a second: the pattern swaps over.
    assert.deepEqual(rows(lines({ speed: 20 }, 1), 135, 145), [
      ...Array(5).fill(0),
      ...Array(5).fill(255),
    ]);
    assert.deepEqual(rows(lines({ speed: 20 }, 2), 135, 145), [
      ...Array(5).fill(255),
      ...Array(5).fill(0),
    ]);
  });
});

describe('mirror', () => {
  const corners = (picture) =>
    [
      [10, 10],
      [470, 10],
      [10, 260],
      [470, 260],
    ].map(([x, y]) => picture.at(x, y).join());
  const RED = '255,0,0';
  const GREEN = '0,255,0';
  const BLUE = '0,0,255';
  const WHITE = '255,255,255';

  it('reflects one half onto the other', () => {
    assert.deepEqual(corners(footage(quadrants, [])), [RED, GREEN, BLUE, WHITE]);
    assert.deepEqual(corners(footage(quadrants, [fx('mirror')])), [RED, RED, BLUE, BLUE]);
    assert.deepEqual(corners(footage(quadrants, [fx('mirror', { reverse: true })])), [
      GREEN,
      GREEN,
      WHITE,
      WHITE,
    ]);
    assert.deepEqual(corners(footage(quadrants, [fx('mirror', { mode: 'vertical' })])), [
      RED,
      GREEN,
      RED,
      GREEN,
    ]);
    assert.deepEqual(corners(footage(quadrants, [fx('mirror', { mode: 'quad' })])), [
      RED,
      RED,
      RED,
      RED,
    ]);
    assert.deepEqual(corners(footage(quadrants, [fx('mirror', { mode: 'quad', reverse: true })])), [
      WHITE,
      WHITE,
      WHITE,
      WHITE,
    ]);
  });

  it('is a pixel-for-pixel reflection about the middle of the frame', () => {
    const picture = footage(card, [fx('mirror', { mode: 'quad' })]);
    const source = footage(card, []);
    for (const [x, y] of [
      [0, 0],
      [75, 100],
      [239, 134],
      [200, 30],
      [3, 131],
    ]) {
      const want = source.at(x, y);
      assert.deepEqual(picture.at(x, y), want);
      assert.deepEqual(picture.at(479 - x, y), want, `across at ${x},${y}`);
      assert.deepEqual(picture.at(x, 269 - y), want, `down at ${x},${y}`);
      assert.deepEqual(picture.at(479 - x, 269 - y), want);
    }
  });
});
