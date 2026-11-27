/**
 * Autocorrelation helpers for tempo estimation: the periodicity of an onset
 * envelope shows up as peaks at the beat period and its multiples.
 * @module api/intelligence/dsp/autocorrelation
 */

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
export function smooth(x) {
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
