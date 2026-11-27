import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveParams } from '../../params.js';
import { place } from './emitter.js';
import { launch, motionOf, newBirth, travel } from './motion.js';
import { PARAMS } from './schema.js';

const FRAME = { width: 1920, height: 1080, scale: 1, fps: 30, outWidth: 1920, outHeight: 1080 };
/** Parameters without any variation between particles, unless asked for. */
const params = (over = {}) => ({
  seed: 3,
  ...resolveParams(PARAMS, { spread: 0, speedJitter: 0, speed: 0, ...over }),
});
const near = (actual, expected, tolerance, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} got ${actual}, want ${expected}`);

/** Where particle `index` is at an age, output pixels from the emitter's centre. */
function at(p, age, index = 0, born = 0) {
  const motion = motionOf(p, FRAME);
  const birth = newBirth();
  const out = { x: 0, y: 0 };
  launch(motion, 99, index, 0, born, birth);
  travel(motion, birth, age, out);
  return out;
}

describe('launch and coasting', () => {
  it('travels at its speed in its direction: 0° up, 90° right, 180° down', () => {
    const up = at(params({ speed: 100, direction: 0 }), 2);
    near(up.x, 0, 1e-9);
    near(up.y, -200, 1e-9);
    const right = at(params({ speed: 100, direction: 90 }), 2);
    near(right.x, 200, 1e-9);
    near(right.y, 0, 1e-9);
    near(at(params({ speed: 100, direction: 180 }), 0.5).y, 50, 1e-9);
  });

  it('fans out over the spread and varies its speed by the jitter', () => {
    const p = params({ speed: 100, direction: 90, spread: 60, speedJitter: 0.5 });
    const angles = [];
    const speeds = [];
    for (let i = 0; i < 400; i++) {
      const { x, y } = at(p, 1, i);
      angles.push((Math.atan2(x, -y) * 180) / Math.PI);
      speeds.push(Math.hypot(x, y));
    }
    assert.ok(
      Math.min(...angles) >= 60 && Math.min(...angles) < 63,
      `from ${Math.min(...angles)}°`,
    );
    assert.ok(Math.max(...angles) <= 120 && Math.max(...angles) > 117);
    assert.ok(Math.min(...speeds) >= 50 && Math.min(...speeds) < 53);
    assert.ok(Math.max(...speeds) <= 100 && Math.max(...speeds) > 97);
  });

  it('adds a speed straight away from the centre of the emitter', () => {
    const p = params({ emitter: 'ring', emitterWidth: 0.1, emitterHeight: 0.1, radial: 50 });
    for (let i = 0; i < 20; i++) {
      const start = at(p, 0, i);
      const later = at(p, 2, i);
      near(Math.hypot(later.x - start.x, later.y - start.y), 100, 1e-6, 'distance travelled:');
      // Still on the same ray from the centre.
      near(later.x * start.y - later.y * start.x, 0, 1e-6, 'off its ray:');
      assert.ok(Math.hypot(later.x, later.y) > Math.hypot(start.x, start.y));
    }
  });
});

describe('gravity and drag', () => {
  it('falls by g·a²/2 on top of its coasting', () => {
    const p = params({ speed: 300, direction: 90, gravityY: 400, gravityX: -20 });
    for (const age of [0, 0.5, 1.7, 3]) {
      const { x, y } = at(p, age);
      near(x, 300 * age - 10 * age * age, 1e-9, `x at ${age}:`);
      near(y, 200 * age * age, 1e-9, `y at ${age}:`);
    }
  });

  it('matches a step-by-step simulation of dv/dt = g − drag·v', () => {
    const p = params({ speed: 900, direction: 30, gravityY: 1200, gravityX: 150, drag: 1.8 });
    const dt = 1e-4;
    let [x, y] = [0, 0];
    let [vx, vy] = [900 * Math.sin(Math.PI / 6), -900 * Math.cos(Math.PI / 6)];
    let checked = 0;
    for (let step = 1; step <= 30000; step++) {
      // Midpoint rule: exact enough at this step to stand in for the truth.
      const [ax, ay] = [150 - 1.8 * vx, 1200 - 1.8 * vy];
      const [mx, my] = [vx + (ax * dt) / 2, vy + (ay * dt) / 2];
      x += mx * dt;
      y += my * dt;
      vx += (150 - 1.8 * mx) * dt;
      vy += (1200 - 1.8 * my) * dt;
      if (step % 5000) continue;
      const closed = at(p, step * dt);
      near(closed.x, x, 0.01, `x at ${step * dt}:`);
      near(closed.y, y, 0.01, `y at ${step * dt}:`);
      checked++;
    }
    assert.equal(checked, 6);
  });

  it('settles at the terminal speed g / drag, and stops when there is no gravity', () => {
    const falling = params({ gravityY: 900, drag: 3 });
    near((at(falling, 10.5).y - at(falling, 10).y) / 0.5, 300, 1e-6);
    const thrown = params({ speed: 600, direction: 90, drag: 2 });
    near(at(thrown, 30).x, 300, 1e-6, 'coasts v / drag in all:');
  });

  it('is continuous as drag approaches zero', () => {
    const base = { speed: 500, direction: 45, gravityY: 800 };
    const none = at(params(base), 2);
    for (const drag of [1e-6, 5e-5, 2e-4, 1e-3]) {
      const some = at(params({ ...base, drag }), 2);
      near(some.x, none.x, 3000 * drag + 1e-6, `drag ${drag}:`);
      near(some.y, none.y, 3000 * drag + 1e-6, `drag ${drag}:`);
    }
  });
});

describe('swirl, emitter travel and turbulence', () => {
  it('turns the path about the emitter, clockwise for a positive swirl', () => {
    const p = params({ speed: 100, direction: 90, swirl: 90 });
    const quarter = at(p, 1);
    near(quarter.x, 0, 1e-9);
    near(quarter.y, 100, 1e-9, 'a quarter turn clockwise puts "right" at the bottom:');
    const half = at(p, 2);
    near(half.x, -200, 1e-9);
    // Gravity is not turned with it.
    near(at(params({ swirl: 90, gravityY: 100 }), 1).y, 50, 1e-9);
  });

  it('leaves each particle where the emitter was when it was born', () => {
    const p = params({ driftX: 300, driftY: -40 });
    const early = at(p, 5, 0, 1);
    const late = at(p, 0.5, 1, 4);
    near(early.x, 300, 1e-9);
    near(early.y, -40, 1e-9);
    near(late.x, 1200, 1e-9);
    assert.deepEqual(at(p, 0.1, 0, 1), at(p, 5, 0, 1), 'and stays there');
  });

  it('wanders from nothing, within its reach, without jumps', () => {
    const p = params({ turbulence: 80, turbulenceScale: 200, turbulenceSpeed: 1, speed: 40 });
    const still = params({ speed: 40 });
    let farthest = 0;
    for (let index = 0; index < 60; index++) {
      const start = at(p, 0, index, index * 0.3);
      assert.deepEqual(
        start,
        at(still, 0, index, index * 0.3),
        'a particle is born on the emitter',
      );
      let last = start;
      for (let age = 0.02; age < 4; age += 0.02) {
        const now = at(p, age, index, index * 0.3);
        const straight = at(still, age, index, index * 0.3);
        const [dx, dy] = [now.x - straight.x, now.y - straight.y];
        assert.ok(Math.abs(dx) <= 80 && Math.abs(dy) <= 80, `wandered ${dx}, ${dy}`);
        farthest = Math.max(farthest, Math.hypot(dx, dy));
        assert.ok(Math.hypot(now.x - last.x, now.y - last.y) < 6, `jumped at age ${age}`);
        last = now;
      }
    }
    assert.ok(farthest > 25, `turbulence barely moves anything: ${farthest}`);
  });
});

describe('emitter shapes', () => {
  /** 4000 birth places on a 400 × 200 emitter. */
  const spots = (shape) =>
    Array.from({ length: 4000 }, (_, i) => {
      const out = { x: 0, y: 0 };
      place(shape, 400, 200, ((i * 0.6180339887) % 1) + 0, ((i * 0.7548776662) % 1) + 0, out);
      return out;
    });
  const range = (list, key) => [
    Math.min(...list.map((s) => s[key])),
    Math.max(...list.map((s) => s[key])),
  ];

  it('point and line', () => {
    assert.ok(spots('point').every((s) => s.x === 0 && s.y === 0));
    const line = spots('line');
    assert.ok(line.every((s) => s.y === 0 && Math.abs(s.x) <= 200));
    const [left, right] = range(line, 'x');
    assert.ok(left < -199 && right > 199);
  });

  it('box: evenly over the rectangle', () => {
    const box = spots('box');
    assert.ok(box.every((s) => Math.abs(s.x) <= 200 && Math.abs(s.y) <= 100));
    assert.ok(range(box, 'x')[0] < -198 && range(box, 'y')[1] > 98);
    const quadrant = box.filter((s) => s.x > 0 && s.y > 0).length;
    assert.ok(Math.abs(quadrant - 1000) < 60, `${quadrant} of 4000 in one quadrant`);
  });

  it('circle: evenly over the ellipse; ring: on its outline', () => {
    const inside = (s) => (s.x / 200) ** 2 + (s.y / 100) ** 2;
    const disc = spots('circle');
    assert.ok(disc.every((s) => inside(s) <= 1 + 1e-9));
    const core = disc.filter((s) => inside(s) < 0.25).length;
    assert.ok(Math.abs(core - 1000) < 60, `${core} of 4000 in the inner quarter of the area`);
    const ring = spots('ring');
    assert.ok(ring.every((s) => Math.abs(inside(s) - 1) < 1e-9));
    assert.ok(range(ring, 'x')[0] < -199.9 && range(ring, 'y')[1] > 99.9);
  });

  it('edge: on the outline of the box, by length', () => {
    const edge = spots('edge');
    const onSide = (s) =>
      Math.abs(Math.abs(s.x) - 200) < 1e-9 || Math.abs(Math.abs(s.y) - 100) < 1e-9;
    assert.ok(
      edge.every((s) => onSide(s) && Math.abs(s.x) <= 200 + 1e-9 && Math.abs(s.y) <= 100 + 1e-9),
    );
    const top = edge.filter((s) => Math.abs(s.y + 100) < 1e-9 && Math.abs(s.x) < 200).length;
    assert.ok(
      Math.abs(top - 4000 / 3) < 30,
      `${top} of 4000 on the top side (a third of the outline)`,
    );
  });

  it('sizes the emitter in fractions of the frame and turns it by its rotation', () => {
    const p = params({ emitter: 'line', emitterWidth: 0.5 });
    const xs = Array.from({ length: 300 }, (_, i) => at(p, 0, i).x);
    assert.ok(Math.min(...xs) < -470 && Math.min(...xs) >= -480, 'half of 1920 px wide');
    assert.ok(Math.max(...xs) > 470 && Math.max(...xs) <= 480);
    const upright = { ...p, emitterRotation: 90 };
    for (let i = 0; i < 20; i++) {
      near(at(upright, 0, i).x, 0, 1e-9);
      near(at(upright, 0, i).y, at(p, 0, i).x, 1e-9);
    }
  });
});
