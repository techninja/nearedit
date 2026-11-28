import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FLAT, cutoffCoefficient, damping, filterMix, svf } from './filter.js';
import { NOISE_SCALE, xorshift } from './math.js';
import { RATE, db, level } from './testkit.js';

/** Gain (dB) of a filter for a steady sine. */
function gainAt(hertz, type, cutoff, resonance = 0) {
  const buf = Float64Array.from({ length: RATE / 2 }, (_, i) =>
    Math.sin((2 * Math.PI * hertz * i) / RATE),
  );
  const state = new Float64Array(2);
  const k = damping(resonance);
  const [low, band, high] = filterMix(type);
  svf(buf, buf.length, state, 0, cutoffCoefficient(cutoff, RATE), k, low, band * k, high);
  return db(level(buf, 0.25).rms * Math.SQRT2);
}

/** White noise, the same every time. */
function white(count, seed = 99) {
  let state = seed;
  return Float64Array.from({ length: count }, () => (state = xorshift(state)) * NOISE_SCALE);
}

describe('the state-variable filter', () => {
  it('a low-pass lets the lows through and takes 12 dB an octave off the highs', () => {
    assert.ok(Math.abs(gainAt(100, 'lowpass', 1000)) < 0.2);
    assert.ok(
      Math.abs(gainAt(4000, 'lowpass', 1000) + 24) < 1.5,
      String(gainAt(4000, 'lowpass', 1000)),
    );
    assert.ok(gainAt(8000, 'lowpass', 500) < -45);
    assert.ok(Math.abs(gainAt(1000, 'lowpass', 1000) + 6) < 1, 'damped: 6 dB down at the cutoff');
  });

  it('a high-pass does the opposite, a band-pass keeps the middle at full level', () => {
    assert.ok(Math.abs(gainAt(8000, 'highpass', 1000)) < 0.5);
    assert.ok(Math.abs(gainAt(250, 'highpass', 1000) + 24) < 1.5);
    assert.ok(Math.abs(gainAt(1000, 'bandpass', 1000, 0.5)) < 0.3);
    assert.ok(
      gainAt(100, 'bandpass', 1000, 0.5) < -20 && gainAt(10000, 'bandpass', 1000, 0.5) < -20,
    );
  });

  it('resonance lifts the cutoff: a little at 0.3, more than 25 dB at full', () => {
    assert.ok(gainAt(1000, 'lowpass', 1000, 0.3) > 2);
    assert.ok(gainAt(1000, 'lowpass', 1000, 1) > 25);
    assert.ok(Math.abs(gainAt(100, 'lowpass', 1000, 1)) < 0.5, 'and leaves the lows alone');
    let last = Infinity;
    for (let r = 0; r <= 1.001; r += 0.1) {
      assert.ok(damping(r) < last && damping(r) > 0);
      last = damping(r);
    }
    assert.equal(damping(-1), damping(0));
    assert.equal(damping(9), damping(1));
  });

  it('keeps its tuning at the top of the range', () => {
    assert.ok(Math.abs(gainAt(16000, 'lowpass', 16000) + 6) < 1.5);
    assert.ok(gainAt(16000, 'lowpass', 16000, 0.8) > 15);
    assert.equal(
      cutoffCoefficient(1e9, RATE),
      cutoffCoefficient(0.45 * RATE, RATE),
      'cutoff is capped',
    );
    assert.equal(cutoffCoefficient(0, RATE), cutoffCoefficient(16, RATE));
  });

  it('stays bounded at the highest cutoff and resonance, also while both are thrown about', () => {
    const noise = white(RATE * 2);
    const steady = Float64Array.from(noise);
    svf(
      steady,
      steady.length,
      new Float64Array(2),
      0,
      cutoffCoefficient(20000, RATE),
      damping(1),
      1,
      0,
      0,
    );
    assert.ok(level(steady).finite && level(steady).peak < 30, `peak ${level(steady).peak}`);

    const state = new Float64Array(4);
    const wild = Float64Array.from(noise);
    let seed = 7;
    let g = cutoffCoefficient(20, RATE);
    for (let at = 0; at < wild.length; at += 32) {
      seed = xorshift(seed);
      const next = cutoffCoefficient(20 * 1000 ** Math.abs(seed * NOISE_SCALE), RATE);
      const run = wild.subarray(at, at + 32);
      svf(run, 32, state, 0, g, damping(1), 1, 0, 0, (next - g) / 32);
      svf(run, 32, state, 2, g, FLAT, 1, 0, 0, (next - g) / 32);
      g = next;
    }
    const { finite, peak } = level(wild);
    assert.ok(finite && peak < 200, `peak ${peak}`);
  });

  it('a gliding cutoff ends where a jumped one does', () => {
    const [a, b] = [new Float64Array(2), new Float64Array(2)];
    const [from, to] = [cutoffCoefficient(300, RATE), cutoffCoefficient(3000, RATE)];
    const glided = white(4096);
    const jumped = Float64Array.from(glided);
    svf(glided, 32, a, 0, from, 1, 1, 0, 0, (to - from) / 32);
    svf(glided.subarray(32), 4064, a, 0, to, 1, 1, 0, 0);
    svf(jumped, 32, b, 0, to, 1, 1, 0, 0);
    svf(jumped.subarray(32), 4064, b, 0, to, 1, 1, 0, 0);
    assert.ok(
      Math.abs(glided[4000] - jumped[4000]) < 1e-9,
      'the same filter once the glide is over',
    );
    assert.notEqual(glided[16], jumped[16]);
  });

  it('forgets everything once its input has died away: no numbers too small to be fast', () => {
    const state = new Float64Array(2);
    const buf = white(4096);
    svf(buf, 4096, state, 0, cutoffCoefficient(200, RATE), damping(0.9), 1, 0, 0);
    assert.notEqual(state[0], 0);
    for (let i = 0; i < 400; i++) {
      buf.fill(0);
      svf(buf, 4096, state, 0, cutoffCoefficient(200, RATE), damping(0.9), 1, 0, 0);
    }
    assert.deepEqual([...state], [0, 0]);
  });
});
