import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pulse, saw, triangle } from './oscillators.js';
import { noise, sine, square } from './plainWaves.js';
import { RATE, db, level } from './testkit.js';
import { cents, partial, share, spectrum } from './testkitSpectrum.js';

/** Run a kernel for `count` samples, `chunk` at a time. */
function run(kernel, hertz, count, chunk = 64, ...more) {
  const out = new Float64Array(count);
  const state = new Float64Array(1);
  const buf = new Float64Array(chunk);
  for (let done = 0; done < count; done += chunk) {
    const take = Math.min(chunk, count - done);
    buf.fill(0);
    kernel(buf, take, state, 0, hertz / RATE, ...more);
    out.set(buf.subarray(0, take), done);
  }
  return out;
}

/** Energy that is not on a harmonic of `hertz`, below `top` Hz, against all of it (dB). */
function offHarmonic(signal, hertz, top) {
  const mags = spectrum(signal, 0.1, 32768);
  const bin = RATE / (2 * mags.length);
  let [off, all] = [0, 0];
  mags.forEach((value, i) => {
    const harmonic = Math.round((i * bin) / hertz);
    const away = Math.abs(i * bin - harmonic * hertz);
    all += value * value;
    if (i * bin < top && (harmonic === 0 || away > 12 * bin)) off += value * value;
  });
  return 10 * Math.log10(off / all + 1e-30);
}

/** The bin of a spectrum a frequency falls in. */
const bin = (mags, hertz) => Math.round((hertz * 2 * mags.length) / RATE);

const WAVES = [
  ['saw', (o, c, s, k, inc) => saw(o, c, s, k, inc, 0.5)],
  ['pulse', (o, c, s, k, inc) => pulse(o, c, s, k, inc, 0.5, 0.3)],
  ['triangle', (o, c, s, k, inc) => triangle(o, c, s, k, inc, 0.5)],
  ['sine', (o, c, s, k, inc) => sine(o, c, s, k, inc, 0.5)],
  ['square', (o, c, s, k, inc) => square(o, c, s, k, inc)],
];

describe('oscillators', () => {
  for (const [name, kernel] of WAVES) {
    it(`${name}: in tune, centred, and the same in pieces of any size`, () => {
      const whole = run(kernel, 440, RATE);
      const pieces = run(kernel, 440, RATE, 7);
      assert.deepEqual(pieces, whole, 'chunk size changes nothing');
      const found = partial(spectrum(whole, 0.1), 440);
      assert.ok(Math.abs(cents(found, 440)) < 1, `${found} Hz`);
      const { mean, peak, finite } = level(whole);
      assert.ok(finite && Math.abs(mean) < 2e-3, `mean ${mean}`);
      const loudest = name === 'square' ? 1 : 0.5;
      assert.ok(peak > loudest * 0.9 && peak < loudest * 1.5, `peak ${peak}`);
    });
  }

  it('a high saw does not fold back: what is off its harmonics lies 60 dB down', () => {
    // 3729 Hz: its harmonics pass half the sample rate from the seventh on.
    const hertz = 3729.31;
    const limited = offHarmonic(run(WAVES[0][1], hertz, RATE), hertz, 12000);
    let phase = 0;
    const naive = Float64Array.from({ length: RATE }, () => {
      phase = (phase + hertz / RATE) % 1;
      return phase - 0.5;
    });
    const folded = offHarmonic(naive, hertz, 12000);
    assert.ok(limited < -60, `band-limited: ${limited.toFixed(1)} dB`);
    assert.ok(folded > -35, `a naive saw would fail this: ${folded.toFixed(1)} dB`);
    assert.ok(offHarmonic(run(WAVES[1][1], hertz, RATE), hertz, 12000) < -55, 'the pulse too');
    assert.ok(offHarmonic(run(WAVES[2][1], hertz, RATE), hertz, 12000) < -55, 'and the triangle');
  });

  it('a saw keeps its harmonics: each one a little weaker, none missing', () => {
    const mags = spectrum(run(WAVES[0][1], 220, RATE), 0.1);
    const at = (n) => mags[bin(mags, n * 220)];
    for (const n of [2, 3, 5, 10, 20]) {
      assert.ok(Math.abs(db(at(n) / at(1)) + db(n)) < 1.5, `harmonic ${n}`);
    }
  });

  it('a pulse is up for its width of the time, and a narrow one is brighter', () => {
    for (const width of [0.1, 0.3, 0.5, 0.8]) {
      const signal = run((o, c, s, k, inc) => pulse(o, c, s, k, inc, 1, width), 110, RATE);
      const up = signal.filter((x) => x > 0).length / signal.length;
      assert.ok(Math.abs(up - width) < 0.02, `width ${width}: up ${up}`);
      assert.ok(Math.abs(level(signal).mean) < 2e-3, 'its mean is taken off');
    }
    const even = (width) => {
      const mags = spectrum(
        run((o, c, s, k, i) => pulse(o, c, s, k, i, 1, width), 220, RATE),
        0.1,
      );
      return mags[bin(mags, 440)] / mags[bin(mags, 220)];
    };
    assert.ok(even(0.5) < 0.01, 'a square has no even harmonics');
    assert.ok(even(0.25) > 0.5);
  });

  it('phase modulation adds partials around the carrier', () => {
    const mod = new Float64Array(64);
    const modState = new Float64Array(1);
    const kernel = (o, c, s, k, inc) => {
      mod.fill(0);
      sine(mod, c, modState, 0, inc * 2, 1);
      sine(o, c, s, k, inc, 0.5, mod, 0.3);
    };
    const mags = spectrum(run(kernel, 440, RATE), 0.1);
    const plain = spectrum(run(WAVES[3][1], 440, RATE), 0.1);
    assert.ok(share(plain, 800, 20000) < 1e-6, 'a sine is one partial');
    assert.ok(share(mags, 800, 20000) > 0.2, 'a bent one is many');
  });

  it('noise: the same for a seed, different for another, level and white', () => {
    const make = (seed) => {
      const out = new Float64Array(RATE);
      const seeds = Int32Array.of(seed);
      noise(out, RATE, seeds, 0, 0.5);
      return out;
    };
    const a = make(12345);
    assert.deepEqual(make(12345), a);
    assert.notDeepEqual(make(54321), a);
    const { mean, peak, rms } = level(a);
    assert.ok(Math.abs(mean) < 5e-3 && peak <= 0.5 && Math.abs(rms - 0.5 / Math.sqrt(3)) < 0.01);
    const mags = spectrum(a, 0, 32768);
    for (const [low, high] of [
      [0, 6000],
      [6000, 12000],
      [12000, 18000],
      [18000, 24000],
    ]) {
      assert.ok(Math.abs(share(mags, low, high) - 0.25) < 0.03, `${low}–${high} Hz`);
    }
  });
});
