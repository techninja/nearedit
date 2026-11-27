import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFft } from './fft.js';
import { createOnsetDetector, normalizeEnvelope } from './onset.js';
import { autocorrelate, peakNear } from './autocorrelation.js';
import { estimateTempo } from './tempo.js';
import { trackBeats } from './beatTrack.js';
import { bpmFromBeats, detectBeats } from './detectBeats.js';
import { beatGrid, clickTrack, drumPattern, render, seededNoise } from '../testing/signals.js';

const SAMPLE_RATE = 22050;

/** Run the streaming detector over a whole buffer, in chunks of `chunk` samples. */
function analyse(samples, chunk = 4096) {
  const detector = createOnsetDetector();
  for (let i = 0; i < samples.length; i += chunk) detector.push(samples.subarray(i, i + chunk));
  return detector.finish();
}

/** Largest distance (seconds) from any detected beat to its nearest true beat. */
function worstError(detected, truth) {
  return Math.max(...detected.map((b) => Math.min(...truth.map((t) => Math.abs(t - b)))));
}

/** Fraction of true beats that have a detected beat within `tolerance` seconds. */
function coverage(detected, truth, tolerance = 0.03) {
  const hit = truth.filter((t) => detected.some((b) => Math.abs(b - t) <= tolerance));
  return hit.length / truth.length;
}

const withinPercent = (value, target, percent) =>
  Math.abs(value - target) <= (target * percent) / 100;

test('fft finds the bin of a pure tone', () => {
  const fft = createFft(64);
  const frame = Float32Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 5 * i) / 64));
  const mags = fft.magnitudes(frame, new Float32Array(33));
  const peak = mags.indexOf(Math.max(...mags));
  assert.equal(peak, 5);
  assert.ok(Math.abs(mags[5] - 32) < 1e-3, 'amplitude 1 sine → N/2');
  assert.ok(mags[9] < 1e-3);
  assert.throws(() => createFft(100), /power of two/);
});

test('autocorrelation of a pulse train peaks at its period', () => {
  const x = Float32Array.from({ length: 400 }, (_, i) => (i % 25 === 0 ? 1 : 0));
  const r = autocorrelate(x, 120);
  assert.ok(Math.abs(r[0] - 1) < 1e-9);
  const peak = peakNear(r, 26, 3);
  assert.ok(Math.abs(peak.lag - 25) < 0.01);
  assert.ok(peak.value > 0.95);
  assert.ok(r[12] < 0.1);
});

for (const bpm of [90, 120, 128, 174]) {
  test(`click track at ${bpm} BPM: tempo within 1%, beats within 15 ms`, () => {
    const { samples, beats: truth } = clickTrack(bpm, 30);
    const result = detectBeats(analyse(samples));
    assert.ok(withinPercent(result.bpm, bpm, 1), `bpm ${result.bpm}`);
    assert.ok(worstError(result.beats, truth) < 0.015, `worst ${worstError(result.beats, truth)}`);
    assert.ok(coverage(result.beats, truth) > 0.95, `coverage ${coverage(result.beats, truth)}`);
    assert.ok(result.confidence > 0.9);
  });

  test(`drum pattern at ${bpm} BPM: tempo and beat positions`, () => {
    const { samples, beats: truth } = drumPattern(bpm, 30);
    const result = detectBeats(analyse(samples));
    // Octave policy (see tempo.js): kick/snare are close in strength here, so
    // the true tempo is expected; half tempo would be the documented fallback.
    assert.ok(withinPercent(result.bpm, bpm, 1.5), `bpm ${result.bpm}`);
    assert.ok(worstError(result.beats, truth) < 0.02, `worst ${worstError(result.beats, truth)}`);
    assert.ok(coverage(result.beats, truth) > 0.95);
  });
}

test('octave policy: weak off-beats keep the slower tempo, equal pulses take the faster', () => {
  // 87 BPM pulse with a much quieter hit halfway between beats.
  const strong = beatGrid(87, 30);
  const hits = strong.flatMap((time) => [
    { sound: /** @type {const} */ ('kick'), time, gain: 0.9 },
    { sound: /** @type {const} */ ('hat'), time: time + 30 / 87, gain: 0.08 },
  ]);
  const weak = detectBeats(analyse(render(hits, { seconds: 30 })));
  assert.ok(withinPercent(weak.bpm, 87, 1.5), `weak off-beats → ${weak.bpm}`);
  // The same grid with identical hits on the off-beats is a 174 BPM pulse.
  const even = detectBeats(analyse(clickTrack(174, 30).samples));
  assert.ok(withinPercent(even.bpm, 174, 1), `equal pulses → ${even.bpm}`);
});

test('the tempo range is 40–200 BPM: faster pulses fold down an octave', () => {
  const fast = detectBeats(analyse(clickTrack(240, 20).samples));
  assert.ok(withinPercent(fast.bpm, 120, 1), `240 → ${fast.bpm}`);
  const slow = detectBeats(analyse(clickTrack(50, 40).samples));
  assert.ok(withinPercent(slow.bpm, 50, 1), `50 → ${slow.bpm}`);
  assert.ok(slow.beats.length >= 30);
});

test('beats follow the onsets through timing jitter and a noise floor', () => {
  const jitter = seededNoise(42);
  const truth = beatGrid(110, 40).map((t) => t + 0.012 * jitter());
  const hits = truth.map((time, i) => ({
    sound: /** @type {const} */ (i % 2 ? 'snare' : 'kick'),
    time,
    gain: 0.6 + 0.2 * Math.abs(jitter()),
  }));
  const result = detectBeats(analyse(render(hits, { seconds: 40, noiseLevel: 0.01, seed: 9 })));
  assert.ok(withinPercent(result.bpm, 110, 1.5), `bpm ${result.bpm}`);
  assert.ok(worstError(result.beats, truth) < 0.025, `worst ${worstError(result.beats, truth)}`);
  assert.ok(coverage(result.beats, truth) > 0.9);
});

test('a gradual tempo change is tracked beat by beat', () => {
  const truth = [];
  for (let t = 0.3, bpm = 116; t < 39; t += 60 / bpm, bpm += 0.12) truth.push(t);
  const hits = truth.map((time) => ({ sound: /** @type {const} */ ('kick'), time, gain: 0.8 }));
  const result = detectBeats(analyse(render(hits, { seconds: 40 })));
  assert.ok(result.bpm > 116 && result.bpm < 126, `bpm ${result.bpm}`);
  assert.ok(worstError(result.beats, truth) < 0.025, `worst ${worstError(result.beats, truth)}`);
  assert.ok(coverage(result.beats, truth) > 0.9);
});

test('silence, noise and irregular bursts yield no beats (and no crash)', () => {
  assert.deepEqual(detectBeats(analyse(new Float32Array(SAMPLE_RATE * 10))), {
    beats: [],
    bpm: null,
    confidence: 0,
  });
  const noise = seededNoise(3);
  const hiss = Float32Array.from({ length: SAMPLE_RATE * 30 }, () => 0.3 * noise());
  assert.deepEqual(detectBeats(analyse(hiss)).beats, []);
  assert.equal(detectBeats(analyse(hiss)).bpm, null);

  const random = seededNoise(11);
  const bursts = [];
  for (let t = 0.3; t < 29; t += 0.12 + 0.5 * Math.abs(random())) {
    bursts.push({ sound: /** @type {const} */ ('snare'), time: t, gain: 0.5 });
  }
  const speechLike = detectBeats(analyse(render(bursts, { seconds: 30, noiseLevel: 0.002 })));
  assert.deepEqual(speechLike.beats, []);
});

test('degenerate input: empty, tiny and constant signals', () => {
  assert.deepEqual(detectBeats(analyse(new Float32Array(0))).beats, []);
  assert.deepEqual(detectBeats(analyse(clickTrack(120, 1).samples)).beats, []);
  const dc = new Float32Array(SAMPLE_RATE * 5).fill(0.5);
  assert.deepEqual(detectBeats(analyse(dc)).beats, []);
  assert.equal(normalizeEnvelope(new Float32Array(100), 86), null);
  assert.equal(estimateTempo(new Float32Array(10), 86), null);
  assert.deepEqual(trackBeats(new Float32Array(1), 40), []);
  assert.equal(bpmFromBeats([1]), null);
});

test('the result does not depend on how the PCM stream is chunked', () => {
  const { samples } = drumPattern(128, 12);
  const whole = analyse(samples, samples.length);
  const odd = analyse(samples, 1777);
  const tiny = analyse(samples, 100);
  assert.deepEqual([...odd.flux], [...whole.flux]);
  assert.deepEqual([...tiny.flux], [...whole.flux]);
  assert.equal(whole.frameRate, SAMPLE_RATE / 256);
  assert.ok(Math.abs(whole.duration - 12) < 1e-6);
});

test('an hour of audio is analysed in bounded memory and reasonable time', () => {
  // Feed one 20 s pattern 180 times: the detector only ever sees chunks.
  const { samples } = drumPattern(126, 20);
  const detector = createOnsetDetector();
  const started = Date.now();
  for (let i = 0; i < 180; i++) detector.push(samples);
  const onset = detector.finish();
  const result = detectBeats(onset);
  assert.ok(Math.abs(onset.duration - 3600) < 1);
  assert.ok(onset.flux.length < 400_000, 'one float per hop, not the waveform');
  assert.ok(withinPercent(result.bpm, 126, 1), `bpm ${result.bpm}`);
  assert.ok(result.beats.length > 7000 && result.beats.length < 7700, `${result.beats.length}`);
  assert.ok(Date.now() - started < 60_000);
});
