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

import { autocorrelate, peakNear, smooth } from './autocorrelation.js';

export const TEMPO_DEFAULTS = {
  minBpm: 40,
  maxBpm: 200,
  priorBpm: 120,
  priorOctaves: 1,
  minConfidence: 0.15,
  octaveSupport: 0.9,
};

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

  // Score every candidate period: its own peak, reinforced by the peaks at
  // twice and four times the period, weighted by the tempo preference.
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

  // Octave policy, rule 2: step up while the faster pulse is fully supported.
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
