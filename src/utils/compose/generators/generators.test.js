import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen } from '../../../../tests/compose/build.js';
import { draw, near, rgb } from '../../../../tests/compose/pixels.js';

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const one = (type, params, extra) => draw(doc([[gen('g', type, params, extra)]]), 1);
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
const lit = (r) => r > 127;

describe('solid', () => {
  it('fills the whole frame with its colour', () => {
    const frame = one('solid', { color: '#3366cc' });
    assert.equal(
      frame.count((r, g, b) => r === 0x33 && g === 0x66 && b === 0xcc),
      480 * 270,
    );
    close(one('solid', { color: 'red' }).at(0.5, 0.5), rgb('#1e293b'), 0, 'bad colours fall back:');
  });
});

describe('gradient', () => {
  const two = { color1: '#000000', color2: '#ffffff' };

  it('runs left to right at 90° and bottom to top at 0°', () => {
    const across = one('gradient', { ...two, angle: 90 });
    close(across.at(0, 0.5), BLACK, 3);
    close(across.at(479, 0.5), WHITE, 3);
    close(across.at(0.5, 0.2), [128, 128, 128], 3);
    const up = one('gradient', { ...two, angle: 0 });
    close(up.at(0.5, 269), BLACK, 3);
    close(up.at(0.5, 0), WHITE, 3);
    assert.deepEqual(up.at(0.1, 0.5), up.at(0.9, 0.5));
  });

  it('places any number of stops, evenly unless told where', () => {
    const three = one('gradient', { ...two, stops: 3, color2: '#ff0000', color3: '#ffffff' });
    close(three.at(0.5, 0.5), [255, 0, 0], 3);
    const hard = one('gradient', {
      ...two,
      stops: 3,
      color3: '#ffffff',
      position2: 0.25,
      color2: '#000000',
    });
    close(hard.at(0.2, 0.5), BLACK, 3);
    assert.ok(hard.at(0.6, 0.5)[0] > 100);
    const eight = one('gradient', { stops: 8, color8: '#00ff00' });
    close(eight.at(479, 0.5), [0, 255, 0], 4);
  });

  it('draws a radial gradient from its centre to the farthest corner', () => {
    const radial = one('gradient', { ...two, kind: 'radial', center: { x: 0.25, y: 0.5 } });
    close(radial.at(0.25, 0.5), BLACK, 3);
    close(radial.at(479, 0), WHITE, 6);
    assert.ok(radial.at(0.5, 0.5)[0] > radial.at(0.35, 0.5)[0]);
    const small = one('gradient', { ...two, kind: 'radial', size: 0.1 });
    close(small.at(0.9, 0.5), WHITE, 0, 'beyond its radius the last colour holds:');
  });

  it('moves and scales the linear gradient with centre and size', () => {
    const shifted = one('gradient', { ...two, center: { x: 0.25, y: 0.5 } });
    close(shifted.at(0.25, 0.5), [128, 128, 128], 3);
    const tight = one('gradient', { ...two, size: 0.5 });
    close(tight.at(0.2, 0.5), BLACK, 0);
    close(tight.at(0.8, 0.5), WHITE, 0);
  });
});

describe('shape', () => {
  it('draws a rectangle sized in fractions of the frame or in output pixels', () => {
    const byFrame = one('shape', { width: 0.5, height: 0.5 });
    // 135 rows of 270 centred: rows 67 and 202 are half covered.
    assert.deepEqual(byFrame.bounds(lit), { left: 120, top: 67, right: 359, bottom: 202 });
    const byPixels = one('shape', { sizing: 'pixels', widthPx: 960, heightPx: 540 });
    assert.deepEqual(byPixels.data, byFrame.data);
  });

  it('positions by a point plus an offset in output pixels', () => {
    const shape = one('shape', {
      width: 0.1,
      height: 0.1,
      position: { x: 0.25, y: 0.75 },
      offsetX: 960,
    });
    close(shape.at(0.75, 0.75), WHITE);
    close(shape.at(0.25, 0.75), BLACK);
  });

  it('leaves the frame transparent outside an ellipse, polygon and star', () => {
    const ellipse = one('shape', { shape: 'ellipse', width: 0.5, height: 0.5 });
    close(ellipse.at(0.5, 0.5), WHITE);
    close(ellipse.at(0.27, 0.27), BLACK, 0, 'corner of the bounding box:');
    const triangle = one('shape', { shape: 'polygon', sides: 3, width: 0.5, height: 0.5 });
    close(triangle.at(0.5, 0.3), WHITE, 2, 'apex points up:');
    close(triangle.at(0.3, 0.3), BLACK);
    const fat = one('shape', { shape: 'star', points: 5, inner: 0.9, width: 0.5, height: 0.8 });
    const thin = one('shape', { shape: 'star', points: 5, inner: 0.2, width: 0.5, height: 0.8 });
    assert.ok(fat.count(lit) > thin.count(lit) * 2, 'the inner radius shapes the star');
  });

  it('strokes, rounds corners, rotates and can be left unfilled', () => {
    const ring = one('shape', {
      filled: false,
      stroke: '#ff0000',
      strokeWidth: 40,
      width: 0.5,
      height: 0.5,
    });
    close(ring.at(0.5, 0.5), BLACK, 0, 'unfilled centre:');
    close(ring.at(0.25, 0.5), [255, 0, 0], 2, 'stroke on the edge:');
    const round = one('shape', { width: 0.5, height: 0.5, radius: 200 });
    close(round.at(122, 70), BLACK, 0, 'rounded corner:');
    close(round.at(0.5, 0.26), WHITE);
    const turned = one('shape', { width: 0.5, height: 0.1, rotation: 90 });
    const box = turned.bounds(lit);
    assert.ok(box.bottom - box.top > box.right - box.left, 'a wide bar turned upright');
  });

  it('draws a line of a thickness in output pixels', () => {
    const line = one('shape', {
      shape: 'line',
      width: 0.5,
      thickness: 40,
      cap: 'butt',
      fill: '#00ff00',
    });
    assert.deepEqual(
      line.bounds((r, g) => g > 127),
      { left: 120, top: 130, right: 359, bottom: 139 },
    );
  });
});

describe('pattern', () => {
  const row = (frame, y = 0.5) =>
    Array.from({ length: frame.width }, (_, x) => lit(frame.at(x, y)[0]));
  const flips = (cells) => cells.filter((cell, i) => i && cell !== cells[i - 1]).length;
  const bw = { color: '#ffffff', background: '#000000' };

  it('draws stripes of a period in output pixels', () => {
    const frame = one('pattern', { ...bw, size: 160, fill: 0.5 });
    assert.equal(flips(row(frame)), 23, '12 stripes across 1920 px');
    assert.deepEqual(frame.at(100, 10), frame.at(100, 260), 'stripes run top to bottom');
    close(one('pattern', { ...bw, size: 160, fill: 1 }).at(0.3, 0.3), WHITE);
  });

  it('shifts with the offset and drifts with time', () => {
    const base = one('pattern', { ...bw, size: 160 });
    const half = one('pattern', { ...bw, size: 160, offsetX: 80 });
    assert.notDeepEqual(half.at(0.52, 0.5), base.at(0.52, 0.5));
    const drifting = { ...bw, size: 160, speedX: 80 };
    const moved = draw(doc([[gen('g', 'pattern', drifting)]]), 1);
    assert.deepEqual(moved.data, half.data, 'one second at 80 px/s is an offset of 80 px');
    assert.deepEqual(one('pattern', { ...bw, size: 160, offsetX: 160 }).data, base.data);
  });

  it('turns the pattern by its angle', () => {
    const lying = one('pattern', { ...bw, size: 160, angle: 90 });
    assert.equal(flips(row(lying)), 0, 'stripes now run left to right');
  });

  it('draws a checkerboard, dots and a grid', () => {
    const checker = one('pattern', { ...bw, pattern: 'checker', size: 240 });
    assert.notDeepEqual(checker.at(0.5 + 0.03, 0.5 + 0.05), checker.at(0.5 - 0.03, 0.5 + 0.05));
    assert.deepEqual(checker.at(0.5 + 0.03, 0.5 + 0.05), checker.at(0.5 - 0.03, 0.5 - 0.05));
    const dots = one('pattern', { ...bw, pattern: 'dots', size: 240, fill: 0.5 });
    close(dots.at(240 + 30, 135 + 30), WHITE, 2, 'a dot sits in the middle of its cell:');
    close(dots.at(240, 135), BLACK, 2, 'cell corners are background:');
    const grid = one('pattern', { ...bw, pattern: 'grid', size: 240, fill: 0.1 });
    close(grid.at(240, 135 + 20), WHITE, 2, 'a line through the centre:');
    close(grid.at(240 + 30, 135 + 30), BLACK, 2, 'cells are open:');
  });
});

describe('noise', () => {
  const params = { color1: '#000000', color2: '#ffffff' };
  const spread = (frame) => {
    const values = Array.from(
      { length: 200 },
      (_, i) => frame.at((i * 37) % 480, (i * 53) % 270)[0],
    );
    return Math.max(...values) - Math.min(...values);
  };

  it('varies smoothly across the frame, between its colours', () => {
    const frame = one('noise', { ...params, color2: '#ff8000' });
    assert.ok(spread(frame) > 80, `only ${spread(frame)} levels of variation`);
    assert.equal(
      frame.count((r, g, b) => b > 2 || Math.abs(g - r / 2) > 3),
      0,
      'off the colour ramp',
    );
    const step = Math.abs(frame.at(200, 100)[0] - frame.at(201, 100)[0]);
    assert.ok(step < 12, `neighbouring pixels jump by ${step}`);
  });

  it('evolves with time and drifts at a speed in output pixels', () => {
    const still = (extra, time) => draw(doc([[gen('g', 'noise', { ...params, ...extra })]]), time);
    assert.notDeepEqual(still({}, 1).data, still({}, 2).data);
    assert.deepEqual(still({ speed: 0 }, 1).data, still({ speed: 0 }, 3).data);
    // Drifting 480 output px in a second moves the picture 120 canvas px.
    const from = still({ speed: 0, driftX: 480 }, 0);
    const to = still({ speed: 0, driftX: 480 }, 1);
    for (const x of [10, 100, 250]) close(to.at(x + 120, 100), from.at(x, 100), 3, `column ${x}:`);
  });

  it('blends through every colour of a longer ramp', () => {
    const frame = one('noise', {
      colors: 3,
      color1: '#ff0000',
      color2: '#00ff00',
      color3: '#0000ff',
      contrast: 4,
    });
    for (const channel of [0, 1, 2]) {
      assert.ok(
        frame.count((...c) => c[channel] > 200) > 500,
        `channel ${channel} never dominates`,
      );
    }
  });
});
