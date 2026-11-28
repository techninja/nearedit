/**
 * Fitting a tempo to a length of time, so that music written for it ends
 * with the picture: inside a style's tempo range, the tempo at which the
 * span is a whole number of bars — or of beats, when no whole number of
 * bars fits. Among the tempos that fit, the one is taken that sits nearest
 * the style's usual pace and puts the timeline's turning points nearest to
 * bar lines.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Tempo. Isomorphic and pure.
 * @module utils/director/score/fit
 */

import { SONG_LIMITS } from '#utils/music/limits.js';

/**
 * @typedef {Object} Fit
 * @property {number} bpm
 * @property {number} beatsPerBar
 * @property {number} bars - Whole bars of music, at least 1
 * @property {'bars'|'beats'|'free'|'asked'} exact - What the span is a
 *   whole number of: bars, beats, neither (`free`: too short for the
 *   style's range), or whatever the asked tempo gives (`asked`)
 * @property {number} seconds - Length of the music: `bars` at `bpm`
 * @property {number} rest - Seconds of the span after the last whole bar
 */

/** A longer span than this is scored only up to here: a song lasts at most 20 minutes. */
export const MAX_SPAN = SONG_LIMITS.seconds - SONG_LIMITS.tail[1];
const MAX_BARS = SONG_LIMITS.bars[1];
const EPS = 1e-9;

/**
 * How far the turning points lie from the bar lines of a tempo, on average.
 * @param {{ time: number, weight: number }[]} points
 * @param {number} bar - Seconds of one bar
 * @returns {number} 0 (all on bar lines) … 1 (all half a bar away)
 */
export function offGrid(points, bar) {
  let [sum, total] = [0, 0];
  for (const { time, weight } of points) {
    const at = time / bar;
    sum += Math.abs(at - Math.round(at)) * 2 * weight;
    total += weight;
  }
  return total > 0 ? sum / total : 0;
}

/**
 * @param {number} seconds
 * @param {number} bpm
 * @param {number} beatsPerBar
 * @param {Fit['exact']} exact
 * @returns {Fit}
 */
function fitAt(seconds, bpm, beatsPerBar, exact) {
  const bar = (beatsPerBar * 60) / bpm;
  const bars = Math.min(MAX_BARS, Math.max(1, Math.floor(seconds / bar + 1e-6)));
  return {
    bpm,
    beatsPerBar,
    bars,
    exact,
    seconds: bars * bar,
    rest: Math.max(0, seconds - bars * bar),
  };
}

/**
 * The tempo a style plays at for a section of energy: slower for a calm
 * piece, faster for a lively one, always well inside its range.
 * @param {number[]} range - `[slowest, fastest]`
 * @param {number} [energy=0.5] - 0 … 1
 * @returns {number}
 */
export function usualTempo([low, high], energy = 0.5) {
  const lively = Math.min(1, Math.max(0, Number.isFinite(energy) ? energy : 0.5));
  return low + (high - low) * (0.25 + 0.5 * lively);
}

/**
 * Fit a tempo to a span.
 * @param {number} seconds - Length of the span
 * @param {{ bpm: number[], beatsPerBar: number }} style
 * @param {{ energy?: number, bpm?: number, points?: { time: number, weight: number }[] }} [opts] -
 *   `bpm`: a tempo that was asked for (0 or none = fit one); `points`: the
 *   turning points of the timeline, seconds from the start of the span
 * @returns {Fit}
 */
export function fitTempo(seconds, style, opts = {}) {
  const { beatsPerBar } = style;
  const [low, high] = style.bpm;
  const span = Math.min(MAX_SPAN, Math.max(0, Number(seconds) || 0));
  if (opts.bpm > 0) {
    const [slowest, fastest] = SONG_LIMITS.bpm;
    return fitAt(span, Math.min(fastest, Math.max(slowest, opts.bpm)), beatsPerBar, 'asked');
  }
  const usual = usualTempo(style.bpm, opts.energy);
  const points = opts.points || [];
  /**
   * @param {'bars'|'beats'} units - What the span is to be a whole number of
   * @param {number} beats - Beats of one unit
   * @returns {{ bpm: number, cost: number }[]} The tempos that do it, best first
   */
  const candidates = (units, beats) => {
    const from = Math.ceil((low * span) / (60 * beats) - EPS);
    const to = Math.floor((high * span) / (60 * beats) + EPS);
    const found = [];
    for (let count = Math.max(1, from); count <= to && found.length < 64; count++) {
      const bpm = (count * beats * 60) / span;
      const whole = units === 'bars' ? count : count / beatsPerBar;
      // Phrases come in fours: an even number of bars closes more naturally.
      const odd = units === 'beats' ? 0 : whole % 4 === 0 ? 0 : whole % 2 === 0 ? 0.5 : 1;
      // A span of whole beats should not end one beat into a bar.
      const stub = units === 'beats' && count % beatsPerBar === 1 ? 1 : 0;
      const pace = Math.abs(bpm - usual) / Math.max(1, high - low);
      const grid = offGrid(points, (beatsPerBar * 60) / bpm);
      found.push({ bpm, cost: pace + 1.5 * grid + 0.3 * odd + 0.5 * stub });
    }
    return found.sort((a, b) => a.cost - b.cost || a.bpm - b.bpm);
  };
  if (span > 0) {
    const bars = candidates('bars', beatsPerBar).filter(
      (fit) => (span * fit.bpm) / (60 * beatsPerBar) <= MAX_BARS + EPS,
    );
    if (bars.length) return fitAt(span, bars[0].bpm, beatsPerBar, 'bars');
    const beats = candidates('beats', 1);
    if (beats.length && span * low <= MAX_BARS * 60 * beatsPerBar) {
      return fitAt(span, beats[0].bpm, beatsPerBar, 'beats');
    }
  }
  // Too short for one beat of the style, or longer than a song can be: its slowest or usual tempo.
  const long = span * low > MAX_BARS * 60 * beatsPerBar;
  return fitAt(span, long ? low : usual, beatsPerBar, 'free');
}
