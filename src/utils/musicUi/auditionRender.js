/**
 * Rendering a song in the page without freezing it. The engine cannot run
 * in a worker here (a module worker does not get the page's import map),
 * but it renders in chunks: this takes a slice of the song at a time on
 * the main thread, as many frames as fit in a few milliseconds, and lets
 * the page have a turn in between — so pointer, keys and paint stay live
 * while a long song is being made. The samples are exactly the engine's:
 * chunked rendering gives what one long render gives.
 * @module utils/musicUi/auditionRender
 */

import { SAMPLE_RATE, createRenderer } from '#utils/music/engine/renderer.js';

/** Milliseconds one slice of rendering may take. */
export const SLICE_MS = 8;
/** Frames of the first slice, before anything is known about the song's cost. */
const FIRST_FRAMES = 1024;
const MIN_FRAMES = 256;
const MAX_FRAMES = 96000;

/**
 * @typedef {Object} Rendered
 * @property {Float32Array} samples - Interleaved stereo, the whole song
 * @property {number} frames
 * @property {number} sampleRate
 * @property {number} slices - Turns it took
 * @property {number} longest - Milliseconds of the longest slice
 */

/**
 * Give the page a turn. A message, not a timer: nested timers wait four
 * milliseconds each, and timers of a hidden tab a whole second.
 * @returns {Promise<void>}
 */
export function nextTask() {
  if (typeof MessageChannel === 'undefined')
    return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/**
 * Render a whole song, a slice at a time.
 * @param {any} song
 * @param {{ sampleRate?: number, slice?: number, signal?: { aborted: boolean },
 *   pause?: () => Promise<void>, now?: () => number }} [opts] - `slice`:
 *   milliseconds a slice may take; `signal`: give up when it says so;
 *   `pause` and `now` are injectable for tests
 * @returns {Promise<Rendered|null>} null when it was given up
 */
export async function renderSliced(song, opts = {}) {
  const { slice = SLICE_MS, signal, pause = nextTask } = opts;
  const now = opts.now || (() => performance.now());
  const renderer = createRenderer(song, { sampleRate: opts.sampleRate || SAMPLE_RATE });
  const samples = new Float32Array(renderer.frames * 2);
  let frames = FIRST_FRAMES;
  let slices = 0;
  let longest = 0;
  while (renderer.position < renderer.frames) {
    if (signal?.aborted) return null;
    const started = now();
    const at = renderer.position;
    samples.set(renderer.render(frames), at * 2);
    const took = Math.max(0.05, now() - started);
    longest = Math.max(longest, took);
    slices += 1;
    // As many frames next time as would have filled the slice, never more than double.
    const fitting = ((renderer.position - at) * slice) / took;
    frames = Math.round(Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, frames * 2, fitting)));
    await pause();
  }
  if (signal?.aborted) return null;
  return { samples, frames: renderer.frames, sampleRate: renderer.sampleRate, slices, longest };
}

/**
 * Rendered samples as a Web Audio buffer.
 * @param {{ createBuffer: (channels: number, frames: number, rate: number) => AudioBuffer }} ctx
 * @param {Rendered} rendered
 * @returns {AudioBuffer}
 */
export function toAudioBuffer(ctx, rendered) {
  const buffer = ctx.createBuffer(2, Math.max(1, rendered.frames), rendered.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < rendered.frames; i++) {
    left[i] = rendered.samples[i * 2];
    right[i] = rendered.samples[i * 2 + 1];
  }
  return buffer;
}

/**
 * The samples of a buffer as the engine gave them: interleaved stereo.
 * @param {AudioBuffer} buffer
 * @returns {Float32Array}
 */
export function interleaved(buffer) {
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const samples = new Float32Array(buffer.length * 2);
  for (let i = 0; i < buffer.length; i++) {
    samples[i * 2] = left[i];
    samples[i * 2 + 1] = right[i];
  }
  return samples;
}
