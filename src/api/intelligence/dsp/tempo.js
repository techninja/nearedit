/**
 * Global tempo estimate: autocorrelation of the onset envelope, scored over a
 * BPM range with a log-normal preference, then an explicit octave policy.
 *
 * Octave policy (tempo is inherently ambiguous by factors of two):
 *  1. every tempo between `minBpm` and `maxBpm` competes; ties between
 *     octave-related tempi go to the one nearest `priorBpm` (120);
 *  2. the faster octave still wins when its off-beats are about as strong as
 *     its on-beats (autocorrelation ≥ `octaveSupport` of the slower pulse) —
 *     so a 174 BPM click reads 174, while 174 BPM music whose backbeat is
 *     clearly weaker reads 87.
 * @module api/intelligence/dsp/tempo
 */

export const TEMPO_DEFAULTS = {
  minBpm: 40,
  maxBpm: 200,
  priorBpm: 120,
  priorOctaves: 1,
  minConfidence: 0.15,
  octaveSupport: 0.9,
};

/**
 * Normalised, unbiased autocorrelation of the mean-removed signal.
 * @param {ArrayLike<number>} x
 * @param {number} maxLag
 * @returns {Float64Array} r[0..maxLag], r[0] = 1 (all zeros for a flat signal)
 */
export function autocorrelate(x, maxLag) {
  const n = x.length;
  const z = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n || 1;
  let power = 0;
  for (let i = 0; i < n; i++) {
    z[i] = x[i] - mean;
    power += z[i] * z[i];
  }
  const r = new Float64Array(maxLag + 1);
  if (!(power > 0)) return r;
  for (let lag = 0; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0, end = n - lag; i < end; i++) sum += z[i] * z[i + lag];
    r[lag] = sum / (n - lag) / (power / n);
  }
  return r;
}

/**
 * Highest value of `r` within `tolerance` of a fractional lag, refined by
 * parabolic interpolation.
 * @param {Float64Array} r
 * @param {number} lag
 * @param {number} tolerance
 * @returns {{ lag: number, value: number }}
 */
export function peakNear(r, lag, tolerance) {
  const lo = Math.max(1, Math.round(lag - tolerance));
  const hi = Math.min(r.length - 2, Math.round(lag + tolerance));
  if (hi < lo) return { lag, value: 0 };
  let best = lo;
  for (let k = lo + 1; k <= hi; k++) if (r[k] > r[best]) best = k;
  const a = r[best - 1];
  const b = r[best];
  const c = r[best + 1];
  const curve = a - 2 * b + c;
  if (!(curve < 0) || a > b || c > b) return { lag: best, value: b };
  const shift = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve));
  return { lag: best + shift, value: b - 0.25 * (a - c) * shift };
}

/**
 * Light low-pass ([1 2 1]/4 twice) so peaks survive fractional-lag sampling.
 * @param {ArrayLike<number>} x
 * @returns {Float64Array}
 */
function smooth(x) {
  let current = Float64Array.from(x);
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float64Array(current.length);
    for (let i = 0; i < current.length; i++) {
      const left = current[i - 1] ?? current[i];
      const right = current[i + 1] ?? current[i];
      next[i] = 0.25 * left + 0.5 * current[i] + 0.25 * right;
    }
    current = next;
  }
  return current;
}

/**
 * Estimate the tempo of an onset envelope.
 * @param {Float32Array} envelope - From normalizeEnvelope
 * @param {number} frameRate - Envelope frames per second
 * @param {Partial<typeof TEMPO_DEFAULTS>} [options]
 * @returns {{ bpm: number, period: number, confidence: number }|null}
 *   `period` in envelope frames; null when no periodicity stands out
 */
export function estimateTempo(envelope, frameRate, options = {}) {
  const o = { ...TEMPO_DEFAULTS, ...options };
  const n = envelope.length;
  const beatFrames = 60 * frameRate; // lag × bpm
  const minLag = Math.max(2, Math.floor(beatFrames / o.maxBpm));
  const maxLag = Math.min(Math.ceil(beatFrames / o.minBpm), Math.floor(n / 3));
  if (maxLag <= minLag) return null;
  const limit = Math.min(Math.floor(n / 2), 8 * maxLag);
  const r = autocorrelate(smooth(envelope), limit + 1);

  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = r[lag];
    let weight = 1;
    for (const [multiple, w] of [
      [2, 0.5],
      [4, 0.25],
    ]) {
      if (lag * multiple + multiple > limit) break;
      score += w * peakNear(r, lag * multiple, multiple / 2).value;
      weight += w;
    }
    const octaves = Math.log2(beatFrames / lag / o.priorBpm) / o.priorOctaves;
    score = (score / weight) * Math.exp(-0.5 * octaves * octaves);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }

  let pulse = peakNear(r, best, 1.5);
  while (beatFrames / (pulse.lag / 2) <= o.maxBpm) {
    const faster = peakNear(r, pulse.lag / 2, Math.max(1, pulse.lag * 0.03));
    if (faster.value < o.octaveSupport * pulse.value) break;
    pulse = faster;
  }
  if (pulse.value < o.minConfidence) return null;

  // Later peaks (2P, 3P, …) pin the period down more finely than the first.
  let period = pulse.lag;
  for (let k = 2; k <= 8 && k * period + 2 < limit; k++) {
    const peak = peakNear(r, k * period, 1 + 0.01 * k * period);
    if (peak.value < 0.5 * pulse.value) break;
    period = peak.lag / k;
  }
  return { bpm: beatFrames / period, period, confidence: pulse.value };
}
