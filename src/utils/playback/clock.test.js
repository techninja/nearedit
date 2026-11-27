import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from './clock.js';

function setup({ audio = 100, wall = 5000 } = {}) {
  const time = { audio, wall };
  const clock = createClock({ audioNow: () => time.audio, wallNow: () => time.wall });
  return { time, clock };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe('clock', () => {
  it('holds its position until started', () => {
    const { clock } = setup();
    assert.equal(clock.now(), 0);
    assert.equal(clock.isRunning(), false);
  });

  it('follows the audio clock while it runs', () => {
    const { time, clock } = setup();
    clock.start(12);
    assert.equal(clock.source(), 'audio');
    time.audio += 1.5;
    time.wall += 9; // wall clock is ignored
    near(clock.now(), 13.5);
  });

  it('falls back to the wall clock when audio cannot start', () => {
    const { time, clock } = setup({ audio: null });
    clock.start(3);
    assert.equal(clock.source(), 'wall');
    time.wall += 2;
    near(clock.now(), 5);
  });

  it('hands over to the audio clock without a jump when audio starts late', () => {
    const { time, clock } = setup({ audio: null });
    clock.start(0);
    time.wall += 0.4;
    near(clock.now(), 0.4);
    time.audio = 7; // context resumed
    time.wall += 0.1;
    near(clock.now(), 0.5);
    assert.equal(clock.source(), 'audio');
    time.audio += 1;
    time.wall += 50;
    near(clock.now(), 1.5);
  });

  it('carries on by wall clock if the audio clock stops mid-play', () => {
    const { time, clock } = setup();
    clock.start(10);
    time.audio += 2;
    time.wall += 2;
    near(clock.now(), 12);
    time.audio = null; // device lost
    time.wall += 0.5;
    near(clock.now(), 12);
    assert.equal(clock.source(), 'wall');
    time.wall += 0.5;
    near(clock.now(), 12.5);
  });

  it('freezes at the final position on stop', () => {
    const { time, clock } = setup();
    clock.start(1);
    time.audio += 0.25;
    near(clock.stop(), 1.25);
    time.audio += 10;
    near(clock.now(), 1.25);
    assert.equal(clock.isRunning(), false);
  });

  it('restarts from a new position (seek, loop wrap)', () => {
    const { time, clock } = setup();
    clock.start(8);
    time.audio += 1;
    clock.start(2);
    time.audio += 0.5;
    near(clock.now(), 2.5);
  });

  it('never runs backwards if a time source misbehaves', () => {
    const { time, clock } = setup();
    clock.start(4);
    time.audio -= 1;
    near(clock.now(), 4);
  });
});
