/**
 * Volume envelopes for the sound graph. A clip with a keyframed `volume`
 * has a gain that no chain of FFmpeg fades can express, so its gain over
 * time is written out as a control signal — a mono float track FFmpeg reads
 * like any audio file and multiplies into the clip (`amultiply`).
 *
 * The values are `gainEnvelope` samples (the shared level rule: track volume
 * × keyframed clip volume × curved fades), joined by straight lines exactly
 * as an automation curve plays them. The control track runs at a fraction of
 * the audio rate and is resampled by FFmpeg; it is padded at both ends so
 * the resampler's edges fall outside the part that is used. Pure.
 * @module api/render/audioEnvelope
 */

import { gainEnvelope } from '#utils/edl/gainEnvelope.js';
import { SAMPLE_RATE } from './timing.js';

/** Control samples per second: 1/20 of the audio rate. */
export const CONTROL_RATE = 2400;
/** Audio samples per control sample. */
export const CONTROL_STEP = SAMPLE_RATE / CONTROL_RATE;
/** Control samples held before and after the envelope. */
export const CONTROL_PAD = 32;
/** Seconds of envelope asked from `gainEnvelope` at a time (it caps its sample count). */
const SPAN = 100;

/**
 * Whether a clip's gain needs an envelope: its `volume` is keyframed.
 * (Curved fades alone map onto FFmpeg's own fade curves.)
 * @param {{ keyframes?: Record<string, any[]> }} clip
 * @returns {boolean}
 */
export const hasVolumeKeys = (clip) => (clip.keyframes?.volume?.length || 0) > 0;

/**
 * The gain of a clip between two moments as a control track.
 * @param {{ volume?: number }} track
 * @param {any} clip - As in the document (keyframes not resolved)
 * @param {number} from - Timeline seconds, inside the clip
 * @param {number} to - Timeline seconds, inside the clip
 * @returns {Float32Array} `CONTROL_PAD` samples of the first value, then one
 *   sample every `1 / CONTROL_RATE` s from `from` to at least `to`, then
 *   `CONTROL_PAD` samples of the last value
 */
export function controlTrack(track, clip, from, to) {
  const count = Math.max(2, Math.ceil((to - from) * CONTROL_RATE) + 1);
  const out = new Float32Array(count + 2 * CONTROL_PAD);
  let index = 0;
  for (let start = from; index < count; start += SPAN) {
    const end = Math.min(to, start + SPAN);
    const samples = gainEnvelope(track, clip, { from: start, to: end });
    if (samples.length < 2) break;
    const spacing = (end - start) / (samples.length - 1);
    const last = samples.length - 1;
    for (; index < count; index++) {
      const time = from + index / CONTROL_RATE;
      if (time > end && end < to) break;
      const at = Math.min(last, Math.max(0, (time - start) / spacing));
      const i = Math.min(last - 1, Math.floor(at));
      const { gain } = samples[i];
      out[CONTROL_PAD + index] = gain + (samples[i + 1].gain - gain) * (at - i);
    }
  }
  // Whatever was not reached (rounding at the very end) holds the last value.
  for (let i = index; i < count; i++) out[CONTROL_PAD + i] = out[CONTROL_PAD + index - 1] || 0;
  out.fill(out[CONTROL_PAD], 0, CONTROL_PAD);
  out.fill(out[CONTROL_PAD + count - 1], CONTROL_PAD + count);
  return out;
}

/**
 * The control track as the bytes FFmpeg reads (`-f f32le -ar 2400 -ac 1`).
 * @param {Float32Array} control
 * @returns {Buffer}
 */
export function controlBytes(control) {
  const bytes = Buffer.alloc(control.length * 4);
  for (let i = 0; i < control.length; i++) bytes.writeFloatLE(control[i], i * 4);
  return bytes;
}
