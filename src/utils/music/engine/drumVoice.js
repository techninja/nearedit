/**
 * One drum being hit: its tones, noise and metal, summed, coloured and
 * placed in the kit. A voice holds one hit at a time; `strike` starts it
 * again from nothing. Isomorphic; no state outside the voice.
 * @module utils/music/engine/drumVoice
 */

import { colour, fade, fallingTone, noiseBurst } from './drumKernels.js';
import { FLAT, svf } from './filter.js';
import { decayPerSample } from './math.js';
import { pulse } from './oscillators.js';

/** @typedef {import('./drumPatch.js').DrumPatch} DrumPatch */

/** Below this every source counts as silent (−80 dB). */
const SILENT = 1e-4;
/** Seconds an open hat takes to close when it is choked. */
const CHOKE = 0.04;

// Slots of the state array.
const TONE = 0; // 2 × (phase, level, above)
const NOISE = 6; // level, age
const NOISE_FILTER = 8;
const METAL = 10; // level
const METAL_FILTER = 11;
const METAL_PHASE = 13; // 6 phases
const COLOUR = 19; // crusher clock, held value
const LOWPASS = 21;
const FADE = 23; // level of the whole voice

export class DrumVoice {
  /**
   * @param {DrumPatch} patch
   * @param {number} sampleRate
   * @param {number} block - The most samples one `render` is asked for
   */
  constructor(patch, sampleRate, block) {
    this.patch = patch;
    this.active = false;
    this.state = new Float64Array(24);
    this.seeds = new Int32Array(1);
    this.buf = new Float64Array(block);
    this.side = new Float64Array(block);
    this.gain = 0;
    this.fadeCoef = 1;
    this.chokeCoef = decayPerSample(CHOKE, sampleRate);
  }

  /**
   * Start a hit.
   * @param {number} velocity - 0 … 1
   * @param {number} seed - For this hit's noise and phases
   */
  strike(velocity, seed) {
    const { state, patch } = this;
    state.fill(0);
    this.seeds[0] = seed;
    patch.tones.forEach((tone, i) => {
      state[TONE + i * 3] = tone.triangle ? 0.25 : 0;
      state[TONE + i * 3 + 1] = tone.gain;
      state[TONE + i * 3 + 2] = tone.sweep;
    });
    if (patch.noise) state[NOISE] = patch.noise.gain;
    if (patch.metal) state[METAL] = patch.metal.gain;
    // Each square starts somewhere else in its period, the same way every hit.
    for (let i = 0; i < 6; i++) state[METAL_PHASE + i] = (i * 0.381966) % 1;
    state[COLOUR] = 1;
    state[FADE] = 1;
    this.fadeCoef = 1;
    this.gain = velocity * Math.sqrt(velocity);
    this.active = true;
  }

  /** Close the drum quickly — an open hat when the closed one is hit. */
  choke() {
    this.fadeCoef = this.chokeCoef;
  }

  /**
   * Add the next `count` samples of the hit to a stereo pair of buffers.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} offset
   * @param {number} count - At most the block size
   */
  render(left, right, offset, count) {
    const { patch, state, buf, side } = this;
    const { noise, metal } = patch;
    buf.fill(0, 0, count);
    patch.tones.forEach((tone, i) => fallingTone(buf, count, state, TONE + i * 3, tone));
    if (noise) {
      side.fill(0, 0, count);
      noiseBurst(side, count, this.seeds, state, NOISE, noise);
      svf(side, count, state, NOISE_FILTER, noise.g, noise.k, ...noise.mix);
      for (let i = 0; i < count; i++) buf[i] += side[i];
    }
    if (metal) {
      side.fill(0, 0, count);
      metal.incs.forEach((inc, i) => pulse(side, count, state, METAL_PHASE + i, inc, 1, 0.5));
      fade(side, count, state, METAL, metal.decayCoef);
      svf(side, count, state, METAL_FILTER, metal.g, metal.k, ...metal.mix);
      for (let i = 0; i < count; i++) buf[i] += side[i];
    }
    colour(buf, count, state, COLOUR, patch);
    if (patch.lowpass) svf(buf, count, state, LOWPASS, patch.lowpass, FLAT, 1, 0, 0);
    if (this.fadeCoef < 1) fade(buf, count, state, FADE, this.fadeCoef);
    const l = patch.left * this.gain;
    const r = patch.right * this.gain;
    for (let i = 0; i < count; i++) {
      left[offset + i] += buf[i] * l;
      right[offset + i] += buf[i] * r;
    }
    this.active = this.sounding();
  }

  /** @returns {boolean} True while any source is above −80 dB */
  sounding() {
    const { patch, state } = this;
    if (state[FADE] < SILENT) return false;
    if (patch.noise && (state[NOISE] > SILENT || state[NOISE + 1] < patch.noise.attack)) return true;
    if (patch.metal && state[METAL] > SILENT) return true;
    return patch.tones.some((tone, i) => state[TONE + i * 3 + 1] > SILENT);
  }
}
