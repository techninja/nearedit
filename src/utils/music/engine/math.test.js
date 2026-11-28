import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOISE_SCALE,
  dbGain,
  decayPerSample,
  exp,
  noteHz,
  pow2,
  seedOf,
  sinOf,
  sinTurn,
  softClip,
  tanHalf,
  xorshift,
} from './math.js';

describe("the engine's own arithmetic", () => {
  it('sines within 6e-8 of the real thing, over the whole turn', () => {
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const phase = i / 20000;
      worst = Math.max(worst, Math.abs(sinTurn(phase) - Math.sin(2 * Math.PI * phase)));
    }
    assert.ok(worst < 6e-8, `off by ${worst}`);
    assert.equal(sinTurn(0), 0);
    assert.ok(Math.abs(sinTurn(0.25) - 1) < 6e-8);
    assert.ok(Math.abs(sinOf(-0.25) + 1) < 6e-8, 'any angle, also a negative one');
    assert.ok(Math.abs(sinOf(7.75) + 1) < 6e-8);
  });

  it('exponentials to twelve digits, from the very small to the very large', () => {
    for (const x of [-690, -30, -1, -1e-9, 0, 1e-9, 0.5, 1, 10, 100, 700]) {
      assert.ok(Math.abs(exp(x) / Math.exp(x) - 1) < 1e-12, `exp(${x})`);
    }
    assert.equal(exp(0), 1);
    assert.equal(exp(-800), 0);
    assert.equal(exp(NaN), 0, 'never a NaN');
    assert.ok(Number.isFinite(exp(5000)));
    assert.ok(Math.abs(pow2(10) - 1024) < 1e-9);
    assert.ok(Math.abs(pow2(-0.5) - Math.SQRT1_2) < 1e-12);
  });

  it('notes and decibels', () => {
    assert.equal(noteHz(69), 440);
    assert.ok(Math.abs(noteHz(60) - 261.6255653) < 1e-6);
    assert.ok(Math.abs(noteHz(81) - 880) < 1e-9);
    assert.ok(Math.abs(dbGain(-6) - 0.5011872) < 1e-6);
    assert.equal(dbGain(0), 1);
  });

  it('the filter tangent, up to just under half the sample rate', () => {
    for (const share of [0.0004, 0.01, 0.1, 0.25, 0.45, 0.49]) {
      assert.ok(Math.abs(tanHalf(share) / Math.tan(Math.PI * share) - 1) < 1e-6, String(share));
    }
  });

  it('a decay factor that falls 60 dB in the time asked for', () => {
    const coef = decayPerSample(0.5, 48000);
    assert.ok(Math.abs(Math.log10(coef ** 24000) + 3) < 1e-9);
    assert.equal(decayPerSample(0, 48000), 0);
  });

  it('a soft clip that is straight in the middle, flat at ±1 and never turns back', () => {
    assert.equal(softClip(0), 0);
    assert.ok(Math.abs(softClip(0.01) - 0.01) < 1e-6);
    assert.equal(softClip(3), 1);
    assert.equal(softClip(1e9), 1);
    assert.equal(softClip(-7), -1);
    let last = -1;
    for (let x = -4; x <= 4; x += 0.001) {
      const y = softClip(x);
      assert.ok(y >= last && y <= 1 && y >= -1);
      assert.ok(Math.abs(y - Math.tanh(x)) < 0.03, 'the shape of tanh');
      last = y;
    }
  });

  it('noise that is the same in every run: these numbers are the same in every runtime', () => {
    let state = seedOf(3, 7);
    const first = [];
    for (let i = 0; i < 4; i++) first.push((state = xorshift(state)));
    assert.deepEqual(first, [-346610318, -254463154, -2128094704, 920191842]);
    assert.equal(seedOf(3, 7), 655547757);
    assert.notEqual(seedOf(0, 0), 0, 'a seed is never 0, which would be silence for ever');
    assert.notEqual(seedOf(3, 7), seedOf(7, 3));
    let [sum, peak] = [0, 0];
    for (let i = 0; i < 100000; i++) {
      state = xorshift(state);
      sum += state * NOISE_SCALE;
      peak = Math.max(peak, Math.abs(state * NOISE_SCALE));
    }
    assert.ok(Math.abs(sum / 100000) < 0.01, 'no offset');
    assert.ok(peak <= 1 && peak > 0.99);
  });
});
