/**
 * One note of a synth part: its oscillators (two per unison layer and a
 * sub), filter, drive and amplifier. The voice is rendered in runs of at
 * most one control tick; what changes slowly — envelopes, LFO, pitch,
 * cutoff — is set between runs by `control` (voiceControl.js).
 * Isomorphic; no state outside the voice.
 * @module utils/music/engine/voice
 */

import { FLAT, svf } from './filter.js';
import { softClip } from './math.js';
import { noise, pulse, saw, sine, triangle } from './oscillators.js';
import { TICK } from './synthPatch.js';

/** @typedef {import('./synthPatch.js').SynthPatch} SynthPatch */

// Slots of the phase array: one per unison layer for each oscillator, then the sub.
const OSC1 = 0;
const OSC2 = 7;
const SUB = 14;

export class Voice {
  /** @param {any} patch - A compiled patch (synthPatch.js) */
  constructor(patch) {
    this.patch = patch;
    this.active = false;
    /** True while the key is down. */
    this.gate = false;
    this.started = 0;
    this.offAt = Infinity;
    this.note = 60;
    this.pitch = 60;
    this.level = 0;
    this.phase = new Float64Array(15);
    this.seeds = new Int32Array(2);
    this.filter = new Float64Array(8);
    this.a = new Float64Array(TICK);
    this.b = new Float64Array(TICK);
    this.mod = new Float64Array(TICK);
    // Envelopes: stage 0 rising, 1 falling to the sustain, 2 released.
    this.amp = 0;
    this.ampStage = 0;
    this.env = 0;
    this.envStage = 0;
    this.ending = false;
    // What `control` sets for the run that follows.
    this.gain = 0;
    this.gainStep = 0;
    this.goal = 0;
    this.inc = 0;
    this.g = 0;
    this.fm = 0;
    this.width1 = 0.5;
    this.width2 = 0.5;
  }

  /**
   * Add one oscillator to a buffer.
   * @param {string} wave
   * @param {Float64Array} out
   * @param {number} count
   * @param {number} slot - Its phase
   * @param {number} inc
   * @param {number} gain
   * @param {number} width
   */
  oscillate(wave, out, count, slot, inc, gain, width) {
    if (wave === 'saw') saw(out, count, this.phase, slot, inc, gain);
    else if (wave === 'pulse') pulse(out, count, this.phase, slot, inc, gain, width);
    else if (wave === 'triangle') triangle(out, count, this.phase, slot, inc, gain);
    else if (wave === 'noise') noise(out, count, this.seeds, slot < OSC2 ? 0 : 1, gain);
    else sine(out, count, this.phase, slot, inc, gain);
  }

  /**
   * Fill the voice's two buses with its oscillators.
   * @param {number} count
   */
  oscillators(count) {
    const { patch: p, a, b, mod } = this;
    const top = 0.24;
    for (let u = 0; u < p.layers.length; u++) {
      const layer = p.layers[u];
      const bus = layer.second ? b : a;
      const inc1 = Math.min(top, this.inc * p.ratio1 * layer.ratio);
      const inc2 = Math.min(top, this.inc * p.ratio2 * layer.ratio);
      if (p.fm) {
        mod.fill(0, 0, count);
        this.oscillate(p.wave2, mod, count, OSC2 + u, inc2, 1, this.width2);
        const gain2 = p.level2 * layer.gain;
        for (let i = 0; i < count && gain2 > 0; i++) bus[i] += mod[i] * gain2;
        sine(bus, count, this.phase, OSC1 + u, inc1, p.level1 * layer.gain, mod, this.fm);
        continue;
      }
      if (p.level1 > 0) {
        this.oscillate(p.wave1, bus, count, OSC1 + u, inc1, p.level1 * layer.gain, this.width1);
      }
      if (p.level2 > 0) {
        this.oscillate(p.wave2, bus, count, OSC2 + u, inc2, p.level2 * layer.gain, this.width2);
      }
    }
    if (!(p.sub > 0)) return;
    const half = Math.min(top, this.inc * p.ratio1 * 0.5);
    if (!p.stereo) return sine(a, count, this.phase, SUB, half, p.sub);
    mod.fill(0, 0, count);
    sine(mod, count, this.phase, SUB, half, p.sub);
    for (let i = 0; i < count; i++) {
      a[i] += mod[i];
      b[i] += mod[i];
    }
  }

  /**
   * Filter and drive one bus in place.
   * @param {Float64Array} bus
   * @param {number} count
   * @param {number} slot - Its filter state
   */
  shape(bus, count, slot) {
    const p = this.patch;
    svf(bus, count, this.filter, slot, this.g, p.k, p.mix[0], p.mix[1], p.mix[2]);
    if (p.steep) svf(bus, count, this.filter, slot + 2, this.g, FLAT, 1, 0, 0);
    for (let i = 0; i < count && p.pre; i++) bus[i] = softClip(bus[i] * p.pre) * p.post;
  }

  /**
   * Add the next `count` samples to a stereo pair of buffers.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} offset
   * @param {number} count - At most one tick
   */
  render(left, right, offset, count) {
    const { patch: p, a, b } = this;
    a.fill(0, 0, count);
    if (p.stereo) b.fill(0, 0, count);
    this.oscillators(count);
    this.shape(a, count, 0);
    if (p.stereo) this.shape(b, count, 4);
    let gain = this.gain;
    const step = this.gainStep;
    for (let i = 0; i < count; i++, gain += step) {
      const x = a[i] * gain;
      const y = p.stereo ? b[i] * gain : x;
      left[offset + i] += p.stereo ? x * p.mixA + y * p.mixB : x;
      right[offset + i] += p.stereo ? x * p.mixB + y * p.mixA : x;
    }
    this.gain = gain;
  }
}
