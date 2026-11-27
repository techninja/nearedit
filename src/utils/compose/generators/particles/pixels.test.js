import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen } from '../../../../../tests/compose/build.js';
import { draw, near } from '../../../../../tests/compose/pixels.js';
import { resolveParams } from '../../params.js';
import { PARAMS } from './schema.js';
import { countAlive } from './schedule.js';

// Frames are 480 × 270 for a 1920 × 1080 document: 4 output pixels per canvas pixel.
/** Small hard squares that neither move, vary nor fade — unless a test says so. */
const PLAIN = {
  sprite: 'square',
  size: 8,
  sizeJitter: 0,
  speed: 0,
  speedJitter: 0,
  lifetime: 2,
  lifetimeJitter: 0,
  fadeIn: 0,
  fadeOut: 0,
  colors: 1,
  blend: 'normal',
};
const picture = (params, time = 1, extra = {}) =>
  draw(doc([[gen('p', 'particles', { ...PLAIN, ...params }, extra)]]), time);
const lit = (r) => r > 127;
const any = (r) => r > 8;
const close = (actual, expected, tolerance, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} got ${actual}, want ${expected}`);

/** Centre of the light in a frame, canvas pixels. */
function centroid(frame) {
  let [sum, sx, sy] = [0, 0, 0];
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const v = frame.data[(y * frame.width + x) * 4];
      sum += v;
      sx += v * (x + 0.5);
      sy += v * (y + 0.5);
    }
  }
  return { x: sx / sum, y: sy / sum, sum };
}

describe('emitter shapes on the canvas', () => {
  const field = { rate: 1500, prewarm: true };

  it('point: every particle is born at the position', () => {
    const box = picture({ ...field, rate: 50, position: { x: 0.25, y: 0.7 } }).bounds(any);
    assert.deepEqual(box, { left: 119, top: 188, right: 120, bottom: 189 }, 'a 2 px square there');
  });

  it('box: fills its rectangle, sized in fractions of the frame', () => {
    const frame = picture({ ...field, emitter: 'box', emitterWidth: 0.5, emitterHeight: 0.4 });
    const box = frame.bounds(any);
    close(box.left, 119, 1);
    close(box.right, 360, 1);
    close(box.top, 80, 1);
    close(box.bottom, 189, 1);
    assert.ok(frame.count(lit) > 0.2 * 240 * 108, 'the inside is covered');
  });

  it('line: along the width only, turned by the emitter rotation', () => {
    const line = { ...field, emitter: 'line', emitterWidth: 0.5, position: { x: 0.5, y: 0.25 } };
    const flat = picture(line).bounds(any);
    assert.deepEqual([flat.top, flat.bottom], [66, 68]);
    close(flat.left, 119, 1);
    close(flat.right, 360, 1);
    const upright = picture({ ...line, emitterRotation: 90, emitterWidth: 0.25 }).bounds(any);
    assert.deepEqual([upright.left, upright.right], [239, 240]);
    close(upright.top, 7, 1);
    close(upright.bottom, 127, 1);
  });

  it('circle: inside the ellipse; ring and edge: on the outline only', () => {
    const round = { ...field, emitterWidth: 0.5, emitterHeight: 0.6 };
    const inside = (x, y) => ((x - 240) / 120) ** 2 + ((y - 135) / 81) ** 2;
    const disc = picture({ ...round, emitter: 'circle' });
    const ring = picture({ ...round, emitter: 'ring' });
    const edge = picture({ ...round, emitter: 'edge' });
    for (let y = 0; y < 270; y += 3) {
      for (let x = 0; x < 480; x += 3) {
        const at = inside(x, y);
        if (at > 1.08) assert.ok(!any(disc.at(x, y)[0]) && !any(ring.at(x, y)[0]), `${x},${y}`);
        if (at < 0.9) assert.ok(!any(ring.at(x, y)[0]), `ring is hollow at ${x},${y}`);
        const deep = Math.abs(x - 240) < 115 && Math.abs(y - 135) < 76;
        if (deep) assert.ok(!any(edge.at(x, y)[0]), `edge is hollow at ${x},${y}`);
      }
    }
    assert.ok(disc.count(lit) > 0.3 * Math.PI * 120 * 81);
    assert.ok(
      any(ring.at(120, 135)[0]) && any(ring.at(240, 54)[0]),
      'the ring passes its extremes',
    );
    assert.deepEqual(edge.bounds(any), { left: 119, top: 53, right: 360, bottom: 216 });
  });
});

describe('motion on the canvas', () => {
  const shot = { rate: 0, burst: 40, size: 16, lifetime: 4, position: { x: 0.5, y: 0.5 } };

  it('moves a burst along its direction at its speed', () => {
    for (const [direction, dx, dy] of [
      [0, 0, -1],
      [90, 1, 0],
      [180, 0, 1],
      [225, -Math.SQRT1_2, Math.SQRT1_2],
    ]) {
      for (const age of [0.5, 1.5]) {
        const c = centroid(picture({ ...shot, speed: 200, direction, spread: 0 }, age));
        // 200 output px/s are 50 canvas px/s.
        close(c.x, 240 + dx * 50 * age, 0.3, `${direction}° after ${age} s, x:`);
        close(c.y, 135 + dy * 50 * age, 0.3, `${direction}° after ${age} s, y:`);
      }
    }
  });

  it('drops the centre of mass by g·a²/2, whatever the spread', () => {
    const fountain = {
      ...shot,
      burst: 600,
      speed: 120,
      speedJitter: 0.6,
      spread: 360,
      gravityY: 160,
    };
    for (const age of [0.5, 1, 1.5]) {
      const c = centroid(picture(fountain, age));
      const still = centroid(picture({ ...fountain, gravityY: 0 }, age));
      close(c.y - still.y, (160 / 4) * 0.5 * age * age, 0.5, `fall after ${age} s:`);
      close(c.x - still.x, 0, 0.5);
      close(still.x, 240, 4, 'an even spread stays centred:');
    }
    const sideways = centroid(picture({ ...shot, gravityX: -400, speed: 0 }, 1));
    close(sideways.x, 240 - 50, 0.3);
  });

  it('follows the emitter position, a point in fractions of the frame', () => {
    const c = centroid(picture({ ...shot, position: { x: 0.2, y: 0.9 } }, 1));
    close(c.x, 96, 0.3);
    close(c.y, 243, 0.3);
  });
});

describe('a life on the canvas', () => {
  const one = { rate: 0, burst: 1, size: 200, lifetime: 2 };
  const width = (frame) => {
    const box = frame.bounds(lit);
    return box ? box.right - box.left + 1 : 0;
  };

  it('fades in over the first share of the life and out over the last', () => {
    const fading = { ...one, fadeIn: 0.2, fadeOut: 0.5 };
    const level = (age) => picture(fading, age).at(0.5, 0.5)[0];
    close(level(0.2), 128, 1, 'half-way into the fade in:');
    close(level(0.4), 255, 0);
    close(level(1), 255, 0);
    close(level(1.5), 128, 1, 'half-way out:');
    close(level(1.9), 26, 1);
    assert.equal(level(2.01), 0, 'dead');
    close(picture({ ...one, opacity: 0.4 }, 1).at(0.5, 0.5)[0], 102, 1);
  });

  it('changes size from birth to death along the curve', () => {
    const shrinking = { ...one, sizeStart: 1, sizeEnd: 0.2 };
    close(width(picture(shrinking, 0.001)), 50, 1, 'at birth, 200 output px:');
    close(width(picture(shrinking, 1)), 30, 1, 'half-way:');
    close(width(picture(shrinking, 1.999)), 10, 1, 'at death:');
    const eased = { ...shrinking, sizeCurve: 'ease-in' };
    close(width(picture(eased, 1)), 45, 1, 'ease-in holds the size longer:');
    close(width(picture({ ...one, sizeJitter: 0, size: 100 }, 1)), 25, 1);
  });

  it('changes colour from the first to the last', () => {
    const turning = { ...one, colors: 2, color1: '#ff0000', color2: '#0000ff' };
    assert.ok(near(picture(turning, 0.001).at(0.5, 0.5), [255, 0, 0], 1));
    assert.ok(near(picture(turning, 1).at(0.5, 0.5), [128, 0, 128], 6), 'purple half-way');
    assert.ok(near(picture(turning, 1.999).at(0.5, 0.5), [0, 0, 255], 1));
    const faint = { ...one, color1: '#00ff0080' };
    assert.ok(near(picture(faint, 1).at(0.5, 0.5), [0, 128, 0], 1), 'colour alpha is opacity');
  });
});

describe('how many particles are drawn', () => {
  // Each 2 × 2 px square adds 64 levels of red to 4 pixels of a black frame.
  const counted = { emitter: 'box', emitterWidth: 0.95, emitterHeight: 0.95, blend: 'add' };
  const tally = (params, time) =>
    centroid(picture({ ...counted, opacity: 0.25, ...params }, time)).sum / (4 * 64);
  const expected = (params, time) =>
    countAlive({ seed: 11, ...resolveParams(PARAMS, { ...PLAIN, ...params }) }, time);

  it('draws a burst all at once and a stream at its rate', () => {
    const burst = { rate: 0, burst: 200 };
    close(tally(burst, 0.5), 200, 6, 'burst:');
    assert.equal(tally(burst, 2.5), 0, 'burst after its lifetime');
    const stream = { rate: 100, lifetime: 1.5 };
    close(tally(stream, 0.5), 50, 3, 'stream filling:');
    close(tally(stream, 3), 150, 5, 'stream full:');
    close(tally({ ...stream, burst: 60 }, 1), 100 + 60, 6, 'both:');
    assert.equal(expected(stream, 3), 150);
  });

  it('draws no more than maxParticles', () => {
    const flood = { rate: 5000, lifetime: 4, maxParticles: 300, prewarm: true };
    const drawn = tally(flood, 2);
    assert.ok(drawn <= 300 * 1.03 && drawn >= 250, `${drawn} drawn with a cap of 300`);
    close(drawn, expected(flood, 2), 9);
    assert.ok(expected(flood, 2) <= 300);
  });

  it('thins the field by density', () => {
    const field = { rate: 200, lifetime: 2, prewarm: true };
    close(tally({ ...field, density: 0.5 }, 1) / tally(field, 1), 0.5, 0.06);
    assert.equal(tally({ ...field, density: 0 }, 1), 0);
  });
});

describe('blend between particles', () => {
  it('adds, screens or covers where particles overlap', () => {
    const pile = { rate: 0, burst: 3, size: 100, color1: '#808080', opacity: 0.4 };
    const level = (blend) => picture({ ...pile, blend }, 1).at(0.5, 0.5)[0];
    close(level('normal'), 100, 2, 'three layers over each other:');
    close(level('screen'), 124, 2, 'screened:');
    close(level('add'), 153, 2, 'added:');
    assert.equal(
      picture({ ...pile, color1: '#ffffff', opacity: 1, blend: 'add' }, 1).at(0.5, 0.5)[0],
      255,
    );
  });

  it('leaves the frame transparent between particles', () => {
    const over = draw(
      doc([
        [gen('p', 'particles', { ...PLAIN, rate: 0, burst: 1, size: 100 })],
        [gen('bg', 'solid', { color: '#204060' })],
      ]),
      1,
    );
    assert.deepEqual(over.at(0.5, 0.5), [255, 255, 255]);
    assert.deepEqual(over.at(0.2, 0.2), [0x20, 0x40, 0x60]);
  });
});
