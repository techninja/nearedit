/**
 * Beat detection on a finished onset analysis: tempo → beat tracking →
 * sub-frame refinement → seconds. Pure maths; decoding lives in steps/beats.
 * @module api/intelligence/dsp/detectBeats
 */

import { normalizeEnvelope } from './onset.js';
import { estimateTempo } from './tempo.js';
import { trackBeats } from './beatTrack.js';

const SILENCE_RMS = 1e-4; // -80 dBFS: nothing worth analysing
const MIN_BEATS = 4;

/**
 * Hops between an onset and the end of the frame whose flux peaks for it.
 * Measured on clicks, kicks, snares and hi-hats (1.03–1.19 hops clean, up to
 * 1.5 under heavy noise): the log-compressed flux fires about one hop after
 * an onset enters the analysis window, whatever the sound.
 */
export const ONSET_LATENCY = 1.15;

/**
 * Move a beat to the nearest envelope peak (±2 frames) and interpolate it to
 * sub-frame precision. A beat with no onset under it is left where it is.
 * @param {Float32Array} envelope
 * @param {number} frame
 * @returns {number} Fractional frame index
 */
function refine(envelope, frame) {
  let best = frame;
  for (let k = Math.max(1, frame - 2); k <= Math.min(envelope.length - 2, frame + 2); k++) {
    if (envelope[k] > envelope[best]) best = k;
  }
  const a = envelope[best - 1] ?? 0;
  const b = envelope[best];
  const c = envelope[best + 1] ?? 0;
  const curve = a - 2 * b + c;
  if (!(b > 0) || !(curve < 0) || a > b || c > b) return frame;
  return best + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curve));
}

/**
 * Tempo implied by tracked beats: median spacing measured across up to 16
 * beats at a time, which is far finer than one envelope frame.
 * @param {number[]} times - Beat times in seconds
 * @returns {number|null}
 */
export function bpmFromBeats(times) {
  const span = Math.min(16, times.length - 1);
  if (span < 1) return null;
  const spacings = [];
  for (let i = 0; i + span < times.length; i++) spacings.push((times[i + span] - times[i]) / span);
  spacings.sort((a, b) => a - b);
  const median = spacings[spacings.length >> 1];
  return median > 0 ? 60 / median : null;
}

/**
 * @typedef {Object} BeatResult
 * @property {number[]} beats - Beat times in seconds (empty when no beat was found)
 * @property {number|null} bpm
 * @property {number} confidence - 0..1 strength of the tempo periodicity
 */

/**
 * @param {import('./onset.js').OnsetResult} onset
 * @param {Partial<typeof import('./tempo.js').TEMPO_DEFAULTS> & { tightness?: number }} [options]
 * @returns {BeatResult}
 */
export function detectBeats(onset, options = {}) {
  const none = { beats: [], bpm: null, confidence: 0 };
  if (onset.rms < SILENCE_RMS) return none;
  const envelope = normalizeEnvelope(onset.flux, onset.frameRate);
  if (!envelope) return none;
  const tempo = estimateTempo(envelope, onset.frameRate, options);
  if (!tempo) return none;
  const frames = trackBeats(envelope, tempo.period, options);
  if (frames.length < MIN_BEATS) return { ...none, confidence: tempo.confidence };

  const beats = [];
  for (const frame of frames) {
    const seconds = ((refine(envelope, frame) + 1 - ONSET_LATENCY) * onset.hop) / onset.sampleRate;
    const time = Math.round(Math.max(0, seconds) * 1000) / 1000;
    if (!beats.length || time > beats[beats.length - 1]) beats.push(time);
  }
  const bpm = bpmFromBeats(beats) ?? tempo.bpm;
  return { beats, bpm: Math.round(bpm * 10) / 10, confidence: tempo.confidence };
}
