import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, loopRange, playStart } from './looping.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe('loopRange', () => {
  it('is null when looping is off', () => {
    assert.equal(loopRange({ loopEnabled: false, loopStart: 1, loopEnd: 3 }, 10), null);
    assert.equal(loopRange(undefined, 10), null);
  });

  it('uses the loop region when it has length', () => {
    assert.deepEqual(loopRange({ loopEnabled: true, loopStart: 1, loopEnd: 3 }, 10), {
      start: 1,
      end: 3,
    });
  });

  it('loops the whole timeline when the region is empty or inverted', () => {
    assert.deepEqual(loopRange({ loopEnabled: true, loopStart: 0, loopEnd: 0 }, 10), {
      start: 0,
      end: 10,
    });
    assert.deepEqual(loopRange({ loopEnabled: true, loopStart: 5, loopEnd: 2 }, 10), {
      start: 0,
      end: 10,
    });
  });

  it('is null for an empty timeline with no region', () => {
    assert.equal(loopRange({ loopEnabled: true }, 0), null);
  });
});

describe('playStart', () => {
  it('plays from where the playhead is', () => {
    assert.equal(playStart(3, 10, null), 3);
    assert.equal(playStart(-1, 10, null), 0);
  });

  it('starts over when the playhead is at the end', () => {
    assert.equal(playStart(10, 10, null), 0);
    assert.equal(playStart(12, 10, null), 0);
  });

  it('starts at the loop start when at the loop end or the end of the timeline', () => {
    const loop = { start: 2, end: 4 };
    assert.equal(playStart(3, 10, loop), 3);
    assert.equal(playStart(10, 10, loop), 2);
    assert.equal(playStart(6, 10, loop), 6);
  });
});

describe('advance', () => {
  it('moves forward inside the timeline', () => {
    assert.deepEqual(advance(1, 1.016, 10, null), {
      position: 1.016,
      wrapped: false,
      ended: false,
    });
  });

  it('stops exactly at the end of the timeline', () => {
    assert.deepEqual(advance(9.99, 10.004, 10, null), {
      position: 10,
      wrapped: false,
      ended: true,
    });
    assert.deepEqual(advance(0, 0.016, 0, null), { position: 0, wrapped: false, ended: true });
  });

  it('wraps to the loop start, keeping the overshoot', () => {
    const step = advance(3.99, 4.006, 10, { start: 2, end: 4 });
    assert.equal(step.wrapped, true);
    assert.equal(step.ended, false);
    near(step.position, 2.006);
  });

  it('survives a step longer than the loop itself', () => {
    const step = advance(3.9, 9.5, 10, { start: 2, end: 4 });
    assert.equal(step.wrapped, true);
    near(step.position, 3.5);
  });

  it('plays on to the end when started beyond the loop', () => {
    const loop = { start: 2, end: 4 };
    assert.deepEqual(advance(6, 6.016, 10, loop), {
      position: 6.016,
      wrapped: false,
      ended: false,
    });
    assert.equal(advance(9.99, 10.01, 10, loop).ended, true);
  });

  it('keeps looping a region that reaches past the last clip', () => {
    const loop = { start: 8, end: 12 };
    assert.deepEqual(advance(10.5, 10.516, 10, loop), {
      position: 10.516,
      wrapped: false,
      ended: false,
    });
    assert.equal(advance(11.99, 12.01, 10, loop).wrapped, true);
  });

  it('loops the whole timeline', () => {
    const step = advance(9.99, 10.01, 10, { start: 0, end: 10 });
    assert.equal(step.wrapped, true);
    near(step.position, 0.01);
  });
});
