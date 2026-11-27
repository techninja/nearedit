/**
 * A clip's gain over its length, sampled — the raw material for volume
 * envelopes downstream (Web Audio automation curves, FFmpeg volume
 * expressions). Unlike the functions in levels.js this takes the clip as
 * it is in the document and resolves its keyframes at every sample, so a
 * keyframed `volume`, the fade lengths and both fade curves are all in the
 * result. Isomorphic and pure.
 * @module utils/edl/gainEnvelope
 */

import { resolveClip } from './animate.js';
import { clipGain } from './levels.js';

/** @typedef {{ time: number, gain: number }} GainSample */

/** Default distance between samples, seconds. */
export const ENVELOPE_STEP = 0.01;
const MAX_SAMPLES = 100000;

/**
 * Whether a clip's gain is more than `volume × linear fades`: it has a
 * keyframed volume or a curved fade. When false, two linear ramps describe
 * it exactly and no envelope is needed.
 * @param {any} clip
 * @returns {boolean}
 */
export function hasGainEnvelope(clip) {
  const curved = (length, curve) => length > 0 && Boolean(curve) && curve !== 'linear';
  return (
    Boolean(clip.keyframes?.volume?.length) ||
    curved(clip.fadeIn, clip.fadeInCurve) ||
    curved(clip.fadeOut, clip.fadeOutCurve)
  );
}

/**
 * Sample a clip's linear gain (`clipGain`: track volume × clip volume ×
 * fades) at evenly spaced moments. The first sample is at `from`, the last
 * exactly at `to`; the spacing is the largest that fits a whole number of
 * steps and does not exceed `step`, so
 * `samples[i].time = from + i × (to − from) / (samples.length − 1)`.
 * @param {{ volume?: number }} track
 * @param {any} clip - As stored in the document (not resolved)
 * @param {{ step?: number, from?: number, to?: number }} [opts] - `step`:
 *   largest spacing in seconds (default 0.01); `from` / `to`: timeline
 *   times, clamped to the clip (default: the whole clip)
 * @returns {GainSample[]} At least two samples; empty for a clip or range
 *   without length
 */
export function gainEnvelope(track, clip, opts = {}) {
  const from = Math.max(clip.timelineStart, opts.from ?? clip.timelineStart);
  const to = Math.min(clip.timelineEnd, opts.to ?? clip.timelineEnd);
  const length = to - from;
  if (!(length > 0) || !Number.isFinite(length)) return [];
  const step = opts.step > 0 ? opts.step : ENVELOPE_STEP;
  const steps = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(length / step - 1e-9)));
  /** @type {GainSample[]} */
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const time = i === steps ? to : from + (length * i) / steps;
    samples.push({ time, gain: clipGain(track, resolveClip(clip, time), time) });
  }
  return samples;
}
