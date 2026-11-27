/**
 * Beat tracking by dynamic programming (after Ellis, "Beat Tracking by
 * Dynamic Programming", 2007): pick the sequence of frames that maximises
 * onset strength while keeping the spacing close to the tempo period. The
 * beats follow the actual onsets, so small tempo drift is tracked.
 * @module api/intelligence/dsp/beatTrack
 */

/**
 * Onset envelope blurred with a narrow Gaussian (σ = period / 32) so a beat
 * slightly off an onset still collects its energy.
 * @param {Float32Array} envelope
 * @param {number} period
 * @returns {Float64Array}
 */
function localScore(envelope, period) {
  const n = envelope.length;
  const reach = Math.max(1, Math.ceil(period / 8));
  const kernel = new Float64Array(2 * reach + 1);
  for (let k = -reach; k <= reach; k++)
    kernel[k + reach] = Math.exp(-0.5 * ((k * 32) / period) ** 2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const lo = Math.max(-reach, -i);
    const hi = Math.min(reach, n - 1 - i);
    for (let k = lo; k <= hi; k++) sum += kernel[k + reach] * envelope[i + k];
    out[i] = sum;
  }
  return out;
}

/**
 * Frame where the beat chain should end: the last local maximum of the
 * cumulative score that is not dwarfed by the typical maximum.
 * @param {Float64Array} cumulative
 * @returns {number} -1 when there is no maximum at all
 */
function lastBeat(cumulative) {
  const n = cumulative.length;
  const maxima = [];
  for (let i = 1; i < n; i++) {
    const next = i + 1 < n ? cumulative[i + 1] : -Infinity;
    if (cumulative[i] > cumulative[i - 1] && cumulative[i] >= next) maxima.push(i);
  }
  if (!maxima.length) return -1;
  const sorted = maxima.map((i) => cumulative[i]).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  for (let m = maxima.length - 1; m >= 0; m--) {
    if (cumulative[maxima[m]] * 2 > median) return maxima[m];
  }
  return maxima[maxima.length - 1];
}

/**
 * Drop weak leading/trailing beats (silence or noise around the music).
 * @param {number[]} beats
 * @param {Float64Array} score
 * @returns {number[]}
 */
function trimWeakEnds(beats, score) {
  const strength = beats.map((b, i) => {
    const before = i > 0 ? score[beats[i - 1]] : 0;
    const after = i + 1 < beats.length ? score[beats[i + 1]] : 0;
    return 0.5 * before + score[b] + 0.5 * after;
  });
  const rms = Math.sqrt(strength.reduce((s, v) => s + v * v, 0) / (strength.length || 1));
  const strong = strength.map((v) => v > 0.5 * rms);
  const first = strong.indexOf(true);
  if (first < 0) return [];
  return beats.slice(first, strong.lastIndexOf(true) + 1);
}

/**
 * Track beats through an onset envelope given the tempo period.
 * @param {Float32Array} envelope - Unit-variance onset envelope
 * @param {number} period - Beat period in envelope frames
 * @param {{ tightness?: number }} [options] - Higher = stricter tempo (default 100)
 * @returns {number[]} Beat positions as ascending frame indices
 */
export function trackBeats(envelope, period, options = {}) {
  const tightness = options.tightness ?? 100;
  const n = envelope.length;
  if (n < 2 || !(period >= 2)) return [];
  const score = localScore(envelope, period);
  const near = Math.max(1, Math.round(period / 2));
  const far = Math.max(near, Math.round(period * 2));
  const penalty = new Float64Array(far - near + 1);
  for (let d = near; d <= far; d++) penalty[d - near] = -tightness * Math.log(d / period) ** 2;
  let peak = 0;
  for (let i = 0; i < n; i++) if (score[i] > peak) peak = score[i];

  const cumulative = new Float64Array(n);
  const backlink = new Int32Array(n).fill(-1);
  let started = false;
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let from = -1;
    for (let d = near; d <= far; d++) {
      const j = i - d;
      const candidate = penalty[d - near] + (j >= 0 ? cumulative[j] : 0);
      if (candidate > best) {
        best = candidate;
        from = j;
      }
    }
    cumulative[i] = score[i] + best;
    if (!started && score[i] < 0.01 * peak) continue; // nothing to lock onto yet
    started = true;
    backlink[i] = from;
  }

  const tail = lastBeat(cumulative);
  if (tail < 0) return [];
  const beats = [tail];
  while (backlink[beats[beats.length - 1]] >= 0) beats.push(backlink[beats[beats.length - 1]]);
  beats.reverse();
  return trimWeakEnds(beats, score);
}
