/**
 * Rendering a song to samples. `createRenderer` gives the song chunk by
 * chunk — interleaved stereo, as many frames as are asked for — so a long
 * song never sits in memory at once; `renderSong` gives a short one whole.
 * The same song gives the same samples in every run, in every runtime, and
 * whatever the chunk sizes. Isomorphic; no state outside a renderer.
 * @module utils/music/engine/renderer
 */

import { normalizeSong } from '#utils/music/normalize.js';
import { songSeconds } from '#utils/music/timing.js';
import { BLOCK, Mixer } from './mixer.js';

/** @typedef {import('#utils/music/types.js').Renderer} Renderer */

/** Sample rate of a rendering unless another is asked for. */
export const SAMPLE_RATE = 48000;
/** Seconds over which the very end of a song is faded to nothing. */
const FADE = 0.02;

/**
 * @param {any} [opts]
 * @returns {number} A whole sample rate, 8 … 192 kHz
 */
function rateOf(opts) {
  const rate = Number(opts?.sampleRate);
  return Number.isFinite(rate) ? Math.min(192000, Math.max(8000, Math.round(rate))) : SAMPLE_RATE;
}

/**
 * Start rendering a song.
 * @param {any} song - Normalised here
 * @param {{ sampleRate?: number }} [opts]
 * @returns {Renderer} `frames` is the length of the whole song; each
 *   `render(count)` returns the next frames, interleaved (left, right), and
 *   an empty array once the song is over
 */
export function createRenderer(song, opts) {
  const sampleRate = rateOf(opts);
  const normal = normalizeSong(song);
  const frames = Math.round(songSeconds(normal) * sampleRate);
  const mixer = new Mixer(normal, sampleRate);
  const fade = Math.max(1, Math.min(frames, Math.round(FADE * sampleRate)));
  const left = new Float64Array(BLOCK);
  const right = new Float64Array(BLOCK);
  // The mixer answers `latency` samples late: the first ones are skipped.
  let mixed = 0;
  let ready = 0;
  let position = 0;
  let skip = mixer.latency;

  /**
   * @param {number} [count] - Frames wanted; all that are left by default
   * @returns {Float32Array}
   */
  function render(count = frames) {
    const wanted = Math.max(0, Math.min(Math.floor(count) || 0, frames - position));
    const out = new Float32Array(wanted * 2);
    for (let done = 0; done < wanted; ) {
      if (ready === 0) {
        mixer.process(left, right, mixed);
        mixed += BLOCK;
        ready = BLOCK;
        const dropped = Math.min(skip, ready);
        skip -= dropped;
        ready -= dropped;
        continue;
      }
      const take = Math.min(ready, wanted - done);
      for (let i = 0, from = BLOCK - ready; i < take; i++) {
        out[(done + i) * 2] = left[from + i];
        out[(done + i) * 2 + 1] = right[from + i];
      }
      // The very end of the song is faded to nothing.
      for (let i = Math.max(0, frames - fade - position); i < take; i++) {
        const gain = (frames - position - i - 1) / fade;
        out[(done + i) * 2] *= gain;
        out[(done + i) * 2 + 1] *= gain;
      }
      position += take;
      done += take;
      ready -= take;
    }
    return out;
  }

  return {
    frames,
    sampleRate,
    render,
    /** @returns {number} Frames rendered so far */
    get position() {
      return position;
    },
  };
}

/**
 * Render a whole song at once — for short songs; a long one is better
 * taken in chunks from `createRenderer`.
 * @param {any} song
 * @param {{ sampleRate?: number }} [opts]
 * @returns {Float32Array} Interleaved stereo samples
 */
export function renderSong(song, opts) {
  return createRenderer(song, opts).render();
}
