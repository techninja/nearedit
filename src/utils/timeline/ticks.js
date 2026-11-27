/**
 * Ruler ticks: choose a labelled (major) and an unlabelled (minor) step that
 * read well at any zoom — frames when zoomed far in, hours when zoomed far
 * out — and list the ticks of a visible time range. Pure.
 * @module utils/timeline/ticks
 */

import { formatTimecode, timecodeBase } from '#utils/playback/timecode.js';

/** Whole-second steps, in seconds. */
const SECOND_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 18000, 36000];

/**
 * @typedef {Object} TickSteps
 * @property {number} major - Frames between labelled ticks
 * @property {number} minor - Frames between ticks
 */

/**
 * @typedef {Object} Tick
 * @property {number} time - Seconds
 * @property {boolean} major
 * @property {string} label - Timecode for major ticks, '' otherwise
 */

/**
 * Every step the ruler may use, in frames, ascending: the frame counts that
 * divide a second evenly, then whole seconds, minutes and hours.
 * @param {number} base - Frames per timecode second
 * @returns {number[]}
 */
export function stepCandidates(base) {
  const frames = [];
  for (let n = 1; n < base; n++) if (base % n === 0) frames.push(n);
  return [...frames, ...SECOND_STEPS.map((seconds) => seconds * base)];
}

/**
 * Choose the tick steps for a zoom level.
 * @param {number} pps - Pixels per second
 * @param {number} [fps=30]
 * @param {{ minLabelPx?: number, minTickPx?: number }} [opts] - Smallest
 *   distance between labels and between ticks
 * @returns {TickSteps}
 */
export function pickSteps(pps, fps = 30, opts = {}) {
  const { minLabelPx = 104, minTickPx = 6 } = opts;
  const base = timecodeBase(fps);
  const pxPerFrame = pps / (fps > 0 ? fps : 30);
  const candidates = stepCandidates(base);
  const major =
    candidates.find((frames) => frames * pxPerFrame >= minLabelPx) ??
    candidates[candidates.length - 1];
  const fits = (frames) =>
    major % frames === 0 && major / frames <= 10 && frames * pxPerFrame >= minTickPx;
  return { major, minor: candidates.find(fits) ?? major };
}

/**
 * A compact timecode for a ruler label: frames are dropped when ticks fall
 * on whole seconds and the hours when the time is below one hour.
 * @param {number} time - Seconds
 * @param {number} fps
 * @param {number} majorFrames - Frames between labels
 * @returns {string}
 */
export function tickLabel(time, fps, majorFrames) {
  let text = formatTimecode(time, fps);
  if (majorFrames >= timecodeBase(fps)) text = text.slice(0, text.lastIndexOf(':'));
  return text.startsWith('00:') ? text.slice(3) : text;
}

/**
 * The ticks inside a time range.
 * @param {number} start - Seconds
 * @param {number} end - Seconds
 * @param {number} pps - Pixels per second
 * @param {number} [fps=30]
 * @param {{ minLabelPx?: number, minTickPx?: number }} [opts]
 * @returns {Tick[]} In time order; the first may sit slightly before `start`
 *   so that a label scrolling out stays visible
 */
export function rulerTicks(start, end, pps, fps = 30, opts = {}) {
  const rate = fps > 0 ? fps : 30;
  const { major, minor } = pickSteps(pps, rate, opts);
  const first = Math.max(0, Math.floor((start * rate) / major) * (major / minor));
  const last = Math.floor((end * rate) / minor + 1e-6);
  /** @type {Tick[]} */
  const ticks = [];
  for (let i = first; i <= last; i++) {
    const frames = i * minor;
    const time = frames / rate;
    const isMajor = frames % major === 0;
    ticks.push({ time, major: isMajor, label: isMajor ? tickLabel(time, rate, major) : '' });
  }
  return ticks;
}
