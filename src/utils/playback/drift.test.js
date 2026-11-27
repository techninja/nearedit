import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_DRIFT, VIDEO_DRIFT, correctDrift } from './drift.js';

const limits = { soft: 0.02, hard: 0.1, maxNudge: 0.05 };

describe('correctDrift', () => {
  it('leaves an element alone inside the soft tolerance', () => {
    assert.deepEqual(correctDrift(0, limits), { seek: false, rate: 1 });
    assert.deepEqual(correctDrift(0.02, limits), { seek: false, rate: 1 });
    assert.deepEqual(correctDrift(-0.019, limits), { seek: false, rate: 1 });
  });

  it('speeds up an element that is behind and slows one that is ahead', () => {
    const behind = correctDrift(-0.03, limits);
    assert.equal(behind.seek, false);
    assert.ok(Math.abs(behind.rate - 1.03) < 1e-9);
    const ahead = correctDrift(0.04, limits);
    assert.ok(Math.abs(ahead.rate - 0.96) < 1e-9);
  });

  it('caps the nudge', () => {
    assert.equal(correctDrift(-0.09, limits).rate, 1.05);
    assert.equal(correctDrift(0.09, limits).rate, 0.95);
  });

  it('re-seeks beyond the hard tolerance and on a bad reading', () => {
    assert.deepEqual(correctDrift(0.11, limits), { seek: true, rate: 1 });
    assert.deepEqual(correctDrift(-3, limits), { seek: true, rate: 1 });
    assert.deepEqual(correctDrift(NaN, limits), { seek: true, rate: 1 });
  });

  it('converges: repeated nudging closes a 60 ms gap without a seek', () => {
    let drift = -0.06;
    for (let step = 0; step < 600; step++) {
      const { seek, rate } = correctDrift(drift, limits);
      assert.equal(seek, false);
      drift += (rate - 1) / 60; // one 60 Hz tick at that rate
    }
    assert.ok(Math.abs(drift) <= limits.soft + 1e-9);
  });

  it('ships sane presets', () => {
    for (const preset of [AUDIO_DRIFT, VIDEO_DRIFT]) {
      assert.ok(preset.soft > 0 && preset.soft < preset.hard);
      assert.ok(preset.maxNudge > 0 && preset.maxNudge <= 0.1);
    }
  });
});
