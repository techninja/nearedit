import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_DRIFT, VIDEO_DRIFT, correctDrift } from './drift.js';

const limits = { soft: 0.02, hard: 0.1, maxNudge: 0.05 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe('correctDrift', () => {
  it('leaves an element alone inside the soft tolerance', () => {
    assert.deepEqual(correctDrift(0, limits), { seek: false, rate: 1 });
    assert.deepEqual(correctDrift(0.02, limits), { seek: false, rate: 1 });
    assert.deepEqual(correctDrift(-0.019, limits), { seek: false, rate: 1 });
  });

  it('speeds up an element that is behind and slows one that is ahead', () => {
    const behind = correctDrift(-0.03, limits);
    assert.equal(behind.seek, false);
    near(behind.rate, 1.03);
    near(correctDrift(0.04, limits).rate, 0.96);
  });

  it('caps the nudge', () => {
    near(correctDrift(-0.09, limits).rate, 1.05);
    near(correctDrift(0.09, limits).rate, 0.95);
  });

  it('re-seeks beyond the hard tolerance and on a bad reading', () => {
    assert.deepEqual(correctDrift(0.11, limits), { seek: true, rate: 1 });
    assert.deepEqual(correctDrift(-3, limits), { seek: true, rate: 1 });
    assert.deepEqual(correctDrift(NaN, limits), { seek: true, rate: 1 });
  });

  it('keeps correcting below the tolerance once started (hysteresis)', () => {
    assert.equal(correctDrift(-0.012, limits, false).rate, 1);
    near(correctDrift(-0.012, limits, true).rate, 1.012);
    near(correctDrift(-0.006, limits, true).rate, 1.01); // floor: at least 1 %
    assert.equal(correctDrift(-0.005, limits, true).rate, 1); // released at soft / 4
  });

  it('converges: nudging closes a 60 ms gap to a few ms without a seek or flutter', () => {
    let drift = -0.06;
    let rate = 1;
    let changes = 0;
    for (let step = 0; step < 600; step++) {
      const fix = correctDrift(drift, limits, rate !== 1);
      assert.equal(fix.seek, false);
      if ((fix.rate === 1) !== (rate === 1)) changes++;
      rate = fix.rate;
      drift += (rate - 1) / 60; // one 60 Hz tick at that rate
    }
    assert.ok(Math.abs(drift) <= limits.soft * 0.25 + 1e-9, `left at ${drift}`);
    assert.equal(changes, 2); // engaged once, released once
    assert.equal(rate, 1);
  });

  it('ships sane presets', () => {
    for (const preset of [AUDIO_DRIFT, VIDEO_DRIFT]) {
      assert.ok(preset.soft > 0 && preset.soft < preset.hard);
      assert.ok(preset.maxNudge > 0 && preset.maxNudge <= 0.1);
    }
  });
});
