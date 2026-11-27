import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';

const white = (effects) => draw(doc([[gen('s', 'solid', { color: '#ffffff' }, { effects })]]));
/** How much of a white layer over black is shown: 0..1. */
const shown = (picture) => {
  let sum = 0;
  for (let i = 0; i < picture.data.length; i += 4) sum += picture.data[i];
  return sum / (255 * 480 * 270);
};
const close = (actual, expected, tolerance = 2, message = '') =>
  assert.ok(near(actual, expected, tolerance), `${message} got ${actual}, want ${expected}`);
const about = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, want ${expected}`);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

describe('wipe', () => {
  const wipe = (params) => white([fx('wipe', { feather: 0, ...params })]);
  const radialPart = (p) => {
    const radius = -0.5 + p * (Math.hypot(240, 135) + 1);
    let inside = 0;
    for (let y = 0; y < 270; y++) {
      for (let x = 0; x < 480; x++) inside += Math.hypot(x - 239.5, y - 134.5) < radius ? 1 : 0;
    }
    return inside / (480 * 270);
  };
  const part = {
    linear: (p) => Math.max(0, (p * 481 - 0.5) / 480),
    radial: radialPart,
    iris: (p) => ((2 * (p * 241 - 0.5)) / 480) * ((2 * (p * 136 - 0.5)) / 270),
    clock: (p) => p,
  };

  it('shows nothing at 0, everything at 1 and the right part between, in every shape', () => {
    for (const shape of ['linear', 'radial', 'iris', 'clock']) {
      assert.equal(shown(wipe({ shape, progress: 0 })), 0, `${shape} at 0`);
      assert.equal(shown(wipe({ shape, progress: 1 })), 1, `${shape} at 1`);
      for (const p of [0.25, 0.5, 0.75]) {
        about(shown(wipe({ shape, progress: p })), part[shape](p), 0.006, `${shape} at ${p}`);
      }
      const feathered = (p) => shown(wipe({ shape, progress: p, feather: 120 }));
      assert.ok(feathered(0.1) > 0 && feathered(0.02) < 0.05, `${shape} starts gently`);
      assert.ok(feathered(0.98) < 1 && feathered(0.98) > 0.95, `${shape} ends gently`);
      assert.ok(feathered(0.3) < feathered(0.5) && feathered(0.5) < feathered(0.7), shape);
    }
  });

  it('travels in the direction of the angle', () => {
    const lit = (params, x, y) => wipe({ progress: 0.5, ...params }).at(x, y)[0];
    assert.deepEqual([lit({}, 100, 135), lit({}, 380, 135)], [255, 0], '0° reveals from the left');
    assert.deepEqual([lit({ angle: 180 }, 100, 135), lit({ angle: 180 }, 380, 135)], [0, 255]);
    assert.deepEqual([lit({ angle: 90 }, 240, 40), lit({ angle: 90 }, 240, 230)], [255, 0]);
    about(shown(wipe({ progress: 0.5, angle: 37 })), 0.5, 0.004, 'half at any angle');
    // A clock starts at 12 and turns clockwise; `angle` moves the start.
    const clock = { shape: 'clock', progress: 0.25 };
    assert.deepEqual([lit(clock, 300, 80), lit(clock, 300, 190), lit(clock, 180, 80)], [255, 0, 0]);
    assert.deepEqual(
      [lit({ ...clock, angle: 90 }, 300, 190), lit({ ...clock, angle: 90 }, 300, 80)],
      [255, 0],
    );
    // An iris is a box with the frame's proportions; at 45° a diamond.
    const iris = { shape: 'iris', progress: 0.5 };
    assert.deepEqual([lit(iris, 130, 75), lit(iris, 110, 135), lit(iris, 240, 60)], [255, 0, 0]);
    const diamond = { ...iris, angle: 45 };
    assert.deepEqual([lit(diamond, 240, 30), lit(diamond, 100, 60)], [255, 0]);
    const off = { shape: 'radial', progress: 0.3, center: { x: 0.25, y: 0.5 } };
    assert.deepEqual([lit(off, 120, 135), lit(off, 300, 135)], [255, 0], 'the centre moves');
  });

  it('feathers the edge along an S-curve of the width given', () => {
    // Feather 160 is 40 canvas pixels; at half way the edge is in the middle of the frame.
    const picture = wipe({ progress: 0.5, feather: 160 });
    for (const d of [-25, -20, -10, 0, 10, 20, 25]) {
      const want = 255 * (1 - smooth((d + 0.5) / 40 + 0.5));
      close(picture.at(240 + d, 100), Array(3).fill(want), 3, `${d} px from the edge:`);
    }
    const ring = wipe({ shape: 'radial', progress: 0.5, feather: 160 });
    const radius = -20 + 0.5 * (Math.hypot(240, 135) + 40);
    for (const d of [-10, 0, 10]) {
      const want = 255 * (1 - smooth((d + 0.5) / 40 + 0.5));
      close(ring.at(240 + Math.round(radius) + d, 135), Array(3).fill(want), 6, `ring ${d}:`);
    }
  });

  it('inverts to the opposite part, and multiplies into the alpha the layer has', () => {
    for (const shape of ['linear', 'radial', 'iris', 'clock']) {
      for (const feather of [0, 120]) {
        const a = shown(wipe({ shape, progress: 0.4, feather }));
        const b = shown(wipe({ shape, progress: 0.4, feather, invert: true }));
        about(a + b, 1, 0.004, `${shape} feather ${feather} and its inverse`);
      }
    }
    assert.equal(shown(wipe({ progress: 1, invert: true })), 0);
    const half = draw(
      doc([
        [gen('s', 'solid', { color: '#ffffff80' }, { effects: [fx('wipe', { feather: 160 })] })],
      ]),
    );
    close(half.at(100, 100), [128, 128, 128], 1);
    close(half.at(240, 100), [64, 64, 64], 2, 'half of half:');
  });
});

describe('mask', () => {
  const mask = (params) => white([fx('mask', params)]);
  const wide = { shape: 'rectangle', width: 0.5, height: 0.5 };

  it('keeps a rectangle, a rounded rectangle or an ellipse', () => {
    about(shown(mask(wide)), 0.25, 0.001, 'rectangle');
    about(
      shown(mask({ ...wide, radius: 80 })),
      0.25 - ((4 - Math.PI) * 400) / 129600,
      0.001,
      'rounded',
    );
    about(
      shown(mask({ shape: 'ellipse', width: 0.5, height: 0.5 })),
      Math.PI / 16,
      0.001,
      'ellipse',
    );
    const sharp = mask(wide);
    assert.deepEqual(
      [sharp.at(125, 135), sharp.at(115, 135), sharp.at(240, 60)],
      [
        [255, 255, 255],
        [0, 0, 0],
        [0, 0, 0],
      ],
    );
    const round = mask({ ...wide, radius: 80 });
    assert.deepEqual(
      [round.at(122, 70)[0], round.at(140, 70)[0], round.at(128, 76)[0]],
      [0, 255, 255],
    );
    assert.equal(sharp.at(122, 70)[0], 255, 'the square corner is there without a radius');
    assert.equal(shown(mask({ ...wide, width: 0 })), 0, 'no shape, no layer');
    assert.equal(
      shown(mask({ width: 4, height: 4 })),
      1,
      'a shape larger than the frame keeps it all',
    );
  });

  it('places, sizes and turns the shape in the frame', () => {
    const moved = mask({ ...wide, width: 0.2, height: 0.2, center: { x: 0.25, y: 0.75 } });
    assert.deepEqual([moved.at(120, 202)[0], moved.at(240, 135)[0]], [255, 0]);
    const turned = mask({ ...wide, height: 0.2, rotation: 90 });
    assert.deepEqual(
      [turned.at(240, 40)[0], turned.at(160, 135)[0], turned.at(260, 135)[0]],
      [255, 0, 255],
    );
    about(shown(mask({ ...wide, rotation: 30 })), 0.25, 0.002, 'turning keeps the area');
  });

  it('feathers the edge by a blur about as wide as the feather, on both paths', () => {
    // Feather 96 is 24 canvas pixels (σ 8, on a mask reduced four times); 12 is 3 (σ 1, direct).
    const phi = (z) => 0.5 * (1 + Math.tanh(z * 0.85));
    for (const [feather, sigma] of [
      [96, 8],
      [12, 1],
    ]) {
      const picture = mask({ ...wide, feather });
      for (const d of [-2, -1, 0, 1, 2]) {
        const want = 255 * phi(-(d * sigma + 0.5) / sigma);
        close(
          picture.at(360 + d * sigma, 135),
          Array(3).fill(want),
          12,
          `feather ${feather}, ${d}σ:`,
        );
      }
      close(picture.at(240, 135), [255, 255, 255], 1);
      close(picture.at(360 + 4 * sigma + 2, 135), [0, 0, 0], 1);
      about(shown(picture), 0.25, 0.004, 'a feather keeps the area');
    }
  });

  it('inverts to everything but the shape', () => {
    for (const feather of [0, 96]) {
      const a = shown(mask({ ...wide, feather }));
      const b = shown(mask({ ...wide, feather, invert: true }));
      about(a + b, 1, 0.003, `feather ${feather}`);
    }
    const hole = mask({ ...wide, invert: true });
    assert.deepEqual([hole.at(240, 135)[0], hole.at(20, 20)[0]], [0, 255]);
  });
});
